import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBookingDto, AddPaymentDto } from './bookings.dto';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(creatorId: string, role: string, dto: CreateBookingDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
      include: { user: true },
    });

    if (!plan) {
      throw new NotFoundException('Selected pricing plan not found');
    }

    let customerId: string;
    let customerName = 'Customer';

    if (role === 'customer') {
      customerId = creatorId;
      const customer = await this.prisma.user.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        throw new NotFoundException('Customer account not found');
      }
      customerName = customer.name;

      // Ensure this customer is added to the studio owner's customer list
      const existingCustomerMapping = await this.prisma.customer.findFirst({
        where: {
          studioOwnerId: plan.userId,
          phone: customer.phone,
        },
      });

      if (!existingCustomerMapping) {
        await this.prisma.customer.create({
          data: {
            studioOwnerId: plan.userId,
            name: customer.name,
            phone: customer.phone,
          },
        });
      }
    } else {
      // Studio Owner booking directly for a customer (potentially offline)
      if (dto.customerId) {
        // 1. Existing customer select
        const customer = await this.prisma.user.findUnique({
          where: { id: dto.customerId },
        });
        if (!customer) {
          throw new NotFoundException('Selected customer account not found');
        }
        customerId = customer.id;
        customerName = customer.name;
      } else {
        // 2. Custom customer details (by phone or offline placeholder)
        let finalPhone = dto.customerPhone ? dto.customerPhone.trim() : '';
        const hasMobile = finalPhone.length > 0;

        if (!hasMobile) {
          // Auto-generate placeholder phone to bypass database unique constraint
          finalPhone = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        }

        // Search for existing user record
        let resolvedUser = await this.prisma.user.findUnique({
          where: { phone: finalPhone },
        });

        if (!resolvedUser) {
          // Auto-create user record
          resolvedUser = await this.prisma.user.create({
            data: {
              phone: finalPhone,
              firebaseUid: hasMobile ? `pending_${finalPhone}` : `offline_no_phone_${Date.now()}`,
              name: dto.customerName || 'Offline Customer',
              role: 'CUSTOMER',
            },
          });
        }

        customerId = resolvedUser.id;
        customerName = resolvedUser.name;

        // Ensure the customer exists in the studio owner's client list
        const existingCustomer = await this.prisma.customer.findFirst({
          where: {
            studioOwnerId: creatorId,
            phone: finalPhone,
          },
        });

        if (!existingCustomer) {
          await this.prisma.customer.create({
            data: {
              studioOwnerId: creatorId,
              name: dto.customerName || 'Offline Customer',
              phone: finalPhone,
            },
          });
        }
      }
    }

    const totalPrice = plan.price;
    const advancePaid = totalPrice * 0.25; // 25% advance payment

    // Create the booking record
    const booking = await this.prisma.booking.create({
      data: {
        customerId,
        studioOwnerId: plan.userId,
        planId: dto.planId,
        bookingDate: new Date(dto.bookingDate),
        shootAddress: dto.shootAddress,
        totalPrice,
        advancePaid,
        status: role === 'studio_owner' ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
        isPaid: role === 'studio_owner' ? (dto.isPaid || false) : false,
        paymentMethod: role === 'studio_owner' ? dto.paymentMethod : null,
      },
      include: {
        plan: true,
        customer: {
          select: { name: true, phone: true },
        },
      },
    });

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        action: 'BOOKING_CREATED',
        details: `Booking created for plan "${plan.name}". Customer: ${customerName}. Total Price: ₹${totalPrice}.`,
        userId: creatorId,
      },
    }).catch(err => console.error('Audit Log failed:', err));

    // Notify Studio Owner (only if customer placed the booking)
    if (role === 'customer') {
      const dateString = new Date(dto.bookingDate).toLocaleDateString();
      this.notificationsService.sendPushNotification(
        plan.userId,
        'New Booking Request',
        `User ${customerName} booked "${plan.name}" for ${dateString}. Location: ${dto.shootAddress}.`,
        {
          type: 'BOOKING_CREATED',
          bookingId: booking.id,
        },
      ).catch(() => {});
    }

    return booking;
  }

  async getMyBookings(userId: string, role: string) {
    if (role === 'studio_owner') {
      return this.prisma.booking.findMany({
        where: { studioOwnerId: userId },
        include: {
          plan: true,
          customer: {
            select: { id: true, name: true, phone: true, profilePhoto: true },
          },
        },
        orderBy: { bookingDate: 'desc' },
      });
    } else {
      return this.prisma.booking.findMany({
        where: { customerId: userId },
        include: {
          plan: true,
          studioOwner: {
            select: { id: true, name: true, studioName: true, phone: true, profilePhoto: true, upiId: true, upiQrCode: true },
          },
        },
        orderBy: { bookingDate: 'desc' },
      });
    }
  }

  async updateStatus(
    studioOwnerId: string,
    id: string,
    status: BookingStatus,
    isPaid?: boolean,
    paymentMethod?: string,
    isFullPaid?: boolean,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, studioOwnerId },
      include: {
        plan: true,
        studioOwner: { select: { studioName: true, name: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking request not found');
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status,
        isPaid: isPaid !== undefined ? isPaid : booking.isPaid,
        isFullPaid: isFullPaid !== undefined ? isFullPaid : booking.isFullPaid,
        paymentMethod: paymentMethod !== undefined ? paymentMethod : booking.paymentMethod,
      },
      include: {
        plan: true,
        customer: {
          select: { id: true, name: true, phone: true, profilePhoto: true },
        },
        studioOwner: {
          select: { id: true, name: true, studioName: true, phone: true, profilePhoto: true, upiId: true, upiQrCode: true },
        },
      },
    });

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        action: 'BOOKING_STATUS_CHANGED',
        details: `Booking status changed to "${status}" for booking ID ${booking.id}. (isPaid: ${isPaid !== undefined ? isPaid : booking.isPaid}, isFullPaid: ${isFullPaid !== undefined ? isFullPaid : booking.isFullPaid}).`,
        userId: studioOwnerId,
      },
    }).catch(err => console.error('Audit Log failed:', err));

    // Notify Customer
    const studioDisplayName = booking.studioOwner.studioName || booking.studioOwner.name;
    const dateString = new Date(booking.bookingDate).toLocaleDateString();
    this.notificationsService.sendPushNotification(
      booking.customerId,
      'Booking Status Update',
      `Your booking with "${studioDisplayName}" for ${dateString} has been ${status.toLowerCase()}.`,
      {
        type: 'BOOKING_STATUS_CHANGED',
        bookingId: booking.id,
        status: status,
      },
    ).catch(() => {});

    return updated;
  }

  async pay(customerId: string, id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, customerId },
      include: {
        plan: true,
        studioOwner: { select: { studioName: true, name: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { isPaid: true },
      include: {
        plan: true,
        studioOwner: {
          select: { id: true, name: true, studioName: true, phone: true, profilePhoto: true, upiId: true, upiQrCode: true },
        },
      },
    });

    // Notify Studio Owner that advance has been paid
    const dateString = new Date(booking.bookingDate).toLocaleDateString();
    this.notificationsService.sendPushNotification(
      booking.studioOwnerId,
      'Advance Payment Received',
      `Customer has paid the advance for booking on ${dateString}.`,
      {
        type: 'BOOKING_STATUS_CHANGED',
        bookingId: booking.id,
        status: booking.status,
        isPaid: 'true',
      },
    ).catch(() => {});

    return updated;
  }

  async submitPayment(
    customerId: string,
    id: string,
    dto: { transactionRef: string; paymentScreenshot?: string; paymentMethod?: string },
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, customerId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        transactionRef: dto.transactionRef,
        paymentScreenshot: dto.paymentScreenshot,
        paymentMethod: dto.paymentMethod,
      },
      include: {
        plan: true,
        studioOwner: {
          select: { id: true, name: true, studioName: true, phone: true, profilePhoto: true, upiId: true, upiQrCode: true },
        },
      },
    });

    // Notify Studio Owner that manual payment receipt has been uploaded
    this.notificationsService.sendPushNotification(
      booking.studioOwnerId,
      'Payment Reference Received',
      `Customer has uploaded payment reference for booking. Please verify.`,
      {
        type: 'BOOKING_STATUS_CHANGED',
        bookingId: booking.id,
        status: booking.status,
      },
    ).catch(() => {});

    return updated;
  }

  // ─── Booking Payments ──────────────────────────────────────────────────────

  async addPayment(userId: string, role: string, bookingId: string, dto: AddPaymentDto) {
    const booking = await this.prisma.booking.findFirst({
      where: role === 'studio_owner'
        ? { id: bookingId, studioOwnerId: userId }
        : { id: bookingId, customerId: userId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const paymentStatus = role === 'studio_owner' ? (dto.status ?? 'VERIFIED') : 'PENDING';

    const payment = await this.prisma.bookingPayment.create({
      data: {
        bookingId,
        amount: dto.amount,
        method: dto.method,
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        screenshot: dto.screenshot ?? null,
        status: paymentStatus,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'PAYMENT_SUBMITTED',
        details: `Payment of ₹${dto.amount} logged via ${dto.method} by ${role}. Status: ${paymentStatus}. Reference UTR: ${dto.reference ?? 'N/A'}.`,
        userId: userId,
      },
    });

    await this.updateBookingPaymentFlags(bookingId);

    return payment;
  }

  async verifyPayment(studioOwnerId: string, bookingId: string, paymentId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, studioOwnerId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const payment = await this.prisma.bookingPayment.findFirst({
      where: { id: paymentId, bookingId },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    const updatedPayment = await this.prisma.bookingPayment.update({
      where: { id: paymentId },
      data: { status: 'VERIFIED' },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'PAYMENT_VERIFIED',
        details: `Payment of ₹${payment.amount} verified by Studio Owner. Reference UTR: ${payment.reference ?? 'N/A'}.`,
        userId: studioOwnerId,
      },
    });

    await this.updateBookingPaymentFlags(bookingId);

    // Notify Customer
    this.notificationsService.sendPushNotification(
      booking.customerId,
      'Payment Verified',
      `Your payment of ₹${payment.amount} has been verified by the studio.`,
      {
        type: 'BOOKING_STATUS_CHANGED',
        bookingId: booking.id,
        status: booking.status,
      },
    ).catch(() => {});

    return updatedPayment;
  }

  async getPayments(userId: string, role: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: role === 'studio_owner' 
        ? { id: bookingId, studioOwnerId: userId }
        : { id: bookingId, customerId: userId },
      include: {
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Filter VERIFIED payments for summary
    const verifiedPayments = booking.payments.filter((p) => p.status === 'VERIFIED');
    const totalPaid = verifiedPayments.reduce((sum, p) => sum + p.amount, 0);
    const remainingBalance = Math.max(0, booking.totalPrice - totalPaid);

    return {
      bookingId,
      totalPrice: booking.totalPrice,
      advancePaid: booking.advancePaid,
      totalPaid,
      remainingBalance,
      isPaid: booking.isPaid,
      isFullPaid: booking.isFullPaid,
      payments: booking.payments,
    };
  }

  async deletePayment(studioOwnerId: string, bookingId: string, paymentId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, studioOwnerId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const payment = await this.prisma.bookingPayment.findFirst({
      where: { id: paymentId, bookingId },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    await this.prisma.bookingPayment.delete({
      where: { id: paymentId },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'PAYMENT_DELETED',
        details: `Payment of ₹${payment.amount} deleted/rejected by Studio Owner. Reference UTR: ${payment.reference ?? 'N/A'}.`,
        userId: studioOwnerId,
      },
    });

    await this.updateBookingPaymentFlags(bookingId);

    return { success: true };
  }

  private async updateBookingPaymentFlags(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payments: true },
    });

    if (!booking) return;

    // Only sum VERIFIED payments!
    const verifiedPayments = booking.payments.filter((p) => p.status === 'VERIFIED');
    const totalPaid = verifiedPayments.reduce((sum, p) => sum + p.amount, 0);
    const isPaid = totalPaid >= booking.advancePaid;
    const isFullPaid = totalPaid >= booking.totalPrice;

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        isPaid,
        isFullPaid,
      },
    });
  }
}
