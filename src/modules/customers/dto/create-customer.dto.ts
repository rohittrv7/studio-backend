import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({
    example: 'Priya Sharma',
    description: 'Full name of the customer',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: '+919876543210',
    description: 'E.164-formatted phone number of the customer',
  })
  @IsPhoneNumber()
  phone!: string;
}
