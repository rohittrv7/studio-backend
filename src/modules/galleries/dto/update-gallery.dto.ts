import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateGalleryDto {
  @ApiPropertyOptional({
    example: 'Wedding 2024 — Priya & Arjun (Updated)',
    description: 'New name for the gallery',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID of the customer to assign this gallery to',
  })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether customers can download media files from this gallery',
  })
  @IsBoolean()
  @IsOptional()
  downloadEnabled?: boolean;
}
