import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, Matches } from 'class-validator';

export type UserType = 'studio_owner' | 'customer';

export class SendOtpDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Exactly 10-digit mobile number of the user',
  })
  @Matches(/^\d{10}$/, { message: 'Phone number must be exactly 10 digits' })
  phone!: string;

  @ApiProperty({
    enum: ['studio_owner', 'customer'],
    description: 'Whether the caller is a studio owner or a customer',
  })
  @IsEnum(['studio_owner', 'customer'])
  userType!: UserType;
}
