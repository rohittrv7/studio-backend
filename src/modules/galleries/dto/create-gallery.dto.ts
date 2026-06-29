import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateGalleryDto {
  @ApiProperty({
    example: 'Wedding 2024 — Priya & Arjun',
    description: 'Name of the gallery',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
