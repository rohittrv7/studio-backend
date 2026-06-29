import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenameFolderDto {
  @ApiProperty({ example: 'Reception' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
