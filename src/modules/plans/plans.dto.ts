import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
