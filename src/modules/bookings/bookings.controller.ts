import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingStatusDto } from './bookings.dto';
import { BookingStatus } from '@prisma/client';

@ApiTags('bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles('customer')
  @ApiOperation({ summary: 'Place a booking (Customers only)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.sub, dto);
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
    return this.bookingsService.updateStatus(user.sub, id, dto.status as BookingStatus);
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
}

