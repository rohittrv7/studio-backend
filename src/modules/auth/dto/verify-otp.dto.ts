import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { UserType } from './send-otp.dto';

export class VerifyOtpDto {
  @ApiProperty({
    example: '+919876543210',
    description: 'E.164-formatted phone number of the user',
  })
  @IsPhoneNumber()
  phone!: string;

  @ApiPropertyOptional({
    description:
      'Firebase ID token returned after the client completes phone auth. ' +
      'Required unless using dev OTP (development only).',
  })
  @ValidateIf((dto: VerifyOtpDto) => !dto.otp)
  @IsString()
  @IsNotEmpty()
  idToken?: string;

  @ApiPropertyOptional({
    description:
      '6-digit OTP code for development testing (ENABLE_DEV_OTP=true only). ' +
      'Never accepted in production.',
    example: '123456',
  })
  @ValidateIf((dto: VerifyOtpDto) => !dto.idToken)
  @IsString()
  @Length(6, 6)
  otp?: string;

  @ApiProperty({
    enum: ['studio_owner', 'customer'],
    description: 'Whether the caller is a studio owner or a customer',
  })
  @IsEnum(['studio_owner', 'customer'])
  userType!: UserType;
}
