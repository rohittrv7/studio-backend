import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBookingDto } from './bookings.dto';
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
}
