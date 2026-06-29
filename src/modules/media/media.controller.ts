import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('galleries/:galleryId/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // ─── Upload ───────────────────────────────────────────────────────────────

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @Roles('studio_owner')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a photo or video to a gallery' })
  @ApiParam({ name: 'galleryId', description: 'UUID of the target gallery', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'mediaType'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Media file to upload' },
        mediaType: { type: 'string', enum: ['photo', 'video'], description: 'Type of media' },
        folderId: { type: 'string', format: 'uuid', description: 'Optional folder ID' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Media uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only or not owner of gallery' })
  @ApiResponse({ status: 404, description: 'Gallery or folder not found' })
  @ApiResponse({ status: 413, description: 'File too large' })
  @ApiResponse({ status: 415, description: 'Unsupported media type' })
  @ApiResponse({ status: 502, description: 'Cloudinary upload failed' })
  upload(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
  ) {
    return this.mediaService.upload(user.sub, galleryId, file, dto);
  }

  // ─── List Media ───────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner', 'customer')
  @ApiOperation({ summary: 'List media in a gallery (paginated)' })
  @ApiQuery({ name: 'folderId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 30 })
  @ApiResponse({ status: 200, description: 'Paginated list of media files' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
    @Query('folderId') folderId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    return this.mediaService.findAll(
      galleryId,
      user.sub,
      user.role,
      folderId,
      Math.max(1, parseInt(page, 10) || 1),
      Math.min(100, Math.max(1, parseInt(limit, 10) || 30)),
    );
  }

  // ─── Get One ──────────────────────────────────────────────────────────────

  @Get(':mediaId')
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner', 'customer')
  @ApiOperation({ summary: 'Get a single media file' })
  @ApiResponse({ status: 200, description: 'Media file details' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Media file not found' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.mediaService.findOne(galleryId, mediaId, user.sub, user.role);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  @Delete(':mediaId')
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Delete a media file from Cloudinary and the database' })
  @ApiResponse({ status: 200, description: 'Media file deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only or not owner of gallery' })
  @ApiResponse({ status: 404, description: 'Gallery or media file not found' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.mediaService.remove(galleryId, mediaId, user.sub);
  }
}
