import { IsString, IsNotEmpty, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ example: 'plan-uuid-here' })
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @ApiProperty({ example: '2026-06-25T14:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  bookingDate!: string;

  @ApiProperty({ example: 'Flat 402, Sector 15, Dwarka, Delhi' })
  @IsString()
  @IsNotEmpty()
  shootAddress!: string;
}

export enum UpdateStatus {
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

export class UpdateBookingStatusDto {
  @ApiProperty({ example: 'CONFIRMED', enum: UpdateStatus })
  @IsEnum(UpdateStatus)
  status!: UpdateStatus;
}

export class VerifyPaymentDto {
  @ApiProperty({ example: 'pay_NjE4MTI3OD' })
  @IsString()
  @IsNotEmpty()
  razorpayPaymentId!: string;

  @ApiProperty({ example: 'sig_a91b2c...' })
  @IsString()
  @IsNotEmpty()
  razorpaySignature!: string;
}

export class SubmitPaymentDto {
  @ApiProperty({ example: 'UTR1234567890' })
  @IsString()
  @IsNotEmpty()
  transactionRef!: string;

  @ApiProperty({ example: 'data:image/png;base64,...' })
  @IsString()
  @IsOptional()
  paymentScreenshot?: string;
}
