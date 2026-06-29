import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, IsOptional, IsBoolean } from 'class-validator';

export class AssignGalleryDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID of the customer to assign this gallery to',
  })
  @IsUUID()
  @IsNotEmpty()
  customerId!: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether client downloads are enabled',
  })
  @IsOptional()
  @IsBoolean()
  downloadEnabled?: boolean;
}
