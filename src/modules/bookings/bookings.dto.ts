import { IsString, IsNotEmpty, IsDateString, IsEnum } from 'class-validator';
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
