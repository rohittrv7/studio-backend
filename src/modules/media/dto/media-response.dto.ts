import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MediaResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  declare id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  declare galleryId: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001' })
  folderId?: string | null;

  @ApiProperty({ enum: ['PHOTO', 'VIDEO'], example: 'PHOTO' })
  declare mediaType: string;

  @ApiProperty({ example: 'image/jpeg' })
  declare mimeType: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/demo/image/authenticated/s--xxx--/sample.jpg' })
  declare secureUrl: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/demo/image/authenticated/c_auto,h_400,w_400/sample.jpg' })
  declare thumbnailUrl: string;

  @ApiPropertyOptional({ description: 'Fresh signed URL valid for 24 hours' })
  signedUrl?: string;

  @ApiProperty({ example: 5242880 })
  declare fileSize: number;

  @ApiPropertyOptional({ example: 4000 })
  width?: number | null;

  @ApiPropertyOptional({ example: 3000 })
  height?: number | null;

  @ApiPropertyOptional({ description: 'Duration in seconds (videos only)', example: 120.5 })
  durationSeconds?: number | null;

  @ApiProperty({ example: 0 })
  declare downloadCount: number;

  @ApiPropertyOptional({ description: 'Whether the gallery allows downloads' })
  downloadPermitted?: boolean;

  @ApiProperty()
  declare createdAt: Date;

  @ApiProperty()
  declare updatedAt: Date;
}

export class PaginatedMediaResponseDto {
  @ApiProperty({ type: [MediaResponseDto] })
  declare data: MediaResponseDto[];

  @ApiProperty()
  declare meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
