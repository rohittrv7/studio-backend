import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class UploadMediaDto {
  @ApiPropertyOptional({
    description: 'Optional folder ID to place the media in',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @ApiProperty({
    description: 'Type of media being uploaded',
    enum: ['photo', 'video'],
    example: 'photo',
  })
  @IsEnum(['photo', 'video'])
  declare mediaType: 'photo' | 'video';
}
