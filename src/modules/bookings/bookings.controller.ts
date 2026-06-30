import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingStatusDto, SubmitPaymentDto, AddPaymentDto } from './bookings.dto';
import { BookingStatus } from '@prisma/client';

@ApiTags('bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles('customer', 'studio_owner')
  @ApiOperation({ summary: 'Place a booking' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.sub, user.role, dto);
  }

  @Get('my-bookings')
  @ApiOperation({ summary: 'Get all bookings for the logged-in user' })
  getMyBookings(@CurrentUser() user: JwtPayload) {
    return this.bookingsService.getMyBookings(user.sub, user.role);
  }

  @Patch(':id/status')
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Update booking status (Studio Owners only)' })
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateStatus(
      user.sub,
      id,
      dto.status as BookingStatus,
      dto.isPaid,
      dto.paymentMethod,
      dto.isFullPaid,
    );
  }

  @Patch(':id/pay')
  @Roles('customer')
  @ApiOperation({ summary: 'Pay advance for booking (Customers only)' })
  pay(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.bookingsService.pay(user.sub, id);
  }

  @Post(':id/submit-payment')
  @Roles('customer')
  @ApiOperation({ summary: 'Submit manual payment receipt details' })
  submitPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SubmitPaymentDto,
  ) {
    return this.bookingsService.submitPayment(user.sub, id, dto);
  }

  // ─── Booking Payments ──────────────────────────────────────────────────────

  @Post(':id/payments')
  @Roles('customer', 'studio_owner')
  @ApiOperation({ summary: 'Record a new payment for a booking' })
  addPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.bookingsService.addPayment(user.sub, user.role, id, dto);
  }

  @Patch(':id/payments/:paymentId/verify')
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Verify a pending payment record (Studio Owners only)' })
  verifyPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.bookingsService.verifyPayment(user.sub, id, paymentId);
  }

  @Get(':id/payments')
  @Roles('customer', 'studio_owner')
  @ApiOperation({ summary: 'Get payment history and remaining balance for a booking' })
  getPayments(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.bookingsService.getPayments(user.sub, user.role, id);
  }

  @Delete(':id/payments/:paymentId')
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Delete a payment record (Studio Owners only)' })
  deletePayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.bookingsService.deletePayment(user.sub, id, paymentId);
  }
}

