import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { RazorpayService } from './razorpay.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController],
  providers: [BookingsService, RazorpayService],
  exports: [BookingsService, RazorpayService],
})
export class BookingsModule {}
