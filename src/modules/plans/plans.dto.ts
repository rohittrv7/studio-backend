import { IsString, IsNotEmpty, IsNumber, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlanDto {
  @ApiProperty({ example: 'Basic Portfolio Photoshoot' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 12000 })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ example: 'Includes 2 hours session, 20 edited images, and digital downloads' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ example: '4 Hours' })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiPropertyOptional({ example: '50 Edited Photos, Video Teaser' })
  @IsString()
  @IsOptional()
  deliverables?: string;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ example: 'Basic Portfolio Photoshoot' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 12000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ example: 'Includes 2 hours session, 20 edited images, and digital downloads' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '4 Hours' })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiPropertyOptional({ example: '50 Edited Photos, Video Teaser' })
  @IsString()
  @IsOptional()
  deliverables?: string;
}
