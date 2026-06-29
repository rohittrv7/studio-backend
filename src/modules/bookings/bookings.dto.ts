import { IsString, IsNotEmpty, IsDateString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  // Optional fields for Studio Owner booking directly
  @ApiPropertyOptional({ example: 'customer-uuid-here' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'Priya Sharma' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional({ example: 'CASH', description: 'CASH, UPI, or QR_CODE' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}

export enum UpdateStatus {
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

export class UpdateBookingStatusDto {
  @ApiProperty({ example: 'CONFIRMED', enum: UpdateStatus })
  @IsEnum(UpdateStatus)
  status!: UpdateStatus;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isFullPaid?: boolean;

  @ApiPropertyOptional({ example: 'CASH' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
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

  @ApiPropertyOptional({ example: 'CASH', description: 'CASH, UPI, or QR_CODE' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
