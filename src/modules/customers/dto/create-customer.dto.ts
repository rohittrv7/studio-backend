import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({
    example: 'Priya Sharma',
    description: 'Full name of the customer',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: '9876543210',
    description: 'Exactly 10-digit mobile number of the customer',
  })
  @Matches(/^\d{10}$/, { message: 'Phone number must be exactly 10 digits' })
  phone!: string;
}
