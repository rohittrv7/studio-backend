import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsPhoneNumber } from 'class-validator';

export type UserType = 'studio_owner' | 'customer';

export class SendOtpDto {
  @ApiProperty({
    example: '+919876543210',
    description: 'E.164-formatted phone number of the user',
  })
  @IsPhoneNumber()
  phone!: string;

  @ApiProperty({
    enum: ['studio_owner', 'customer'],
    description: 'Whether the caller is a studio owner or a customer',
  })
  @IsEnum(['studio_owner', 'customer'])
  userType!: UserType;
}
