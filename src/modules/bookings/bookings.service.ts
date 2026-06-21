import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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

  async create(customerId: string, dto: CreateBookingDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
      include: { user: true },
    });

    if (!plan) {
      throw new NotFoundException('Selected pricing plan not found');
    }

    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer account not found');
    }

    const totalPrice = plan.price;
    const advancePaid = totalPrice * 0.25; // 25% advance payment

    const booking = await this.prisma.booking.create({
      data: {
        customerId,
        studioOwnerId: plan.userId,
        planId: dto.planId,
        bookingDate: new Date(dto.bookingDate),
        shootAddress: dto.shootAddress,
        totalPrice,
        advancePaid,
        status: BookingStatus.PENDING,
      },
      include: {
        plan: true,
        customer: {
          select: { name: true, phone: true },
        },
      },
    });

    // Notify Studio Owner
    const dateString = new Date(dto.bookingDate).toLocaleDateString();
    this.notificationsService.sendPushNotification(
      plan.userId,
      'New Booking Request',
      `User ${customer.name} booked "${plan.name}" for ${dateString}. Location: ${dto.shootAddress}.`,
      {
        type: 'BOOKING_CREATED',
        bookingId: booking.id,
      },
    ).catch(() => {});

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
            select: { id: true, name: true, studioName: true, phone: true, profilePhoto: true },
          },
        },
        orderBy: { bookingDate: 'desc' },
      });
    }
  }

  async updateStatus(studioOwnerId: string, id: string, status: BookingStatus) {
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
      data: { status },
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
          select: { id: true, name: true, studioName: true, phone: true, profilePhoto: true },
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
}

