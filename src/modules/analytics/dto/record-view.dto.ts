import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordViewDto {
  @ApiProperty({
    description: 'UUID of the gallery being viewed',
    format: 'uuid',
  })
  @IsUUID()
  galleryId!: string;
}
