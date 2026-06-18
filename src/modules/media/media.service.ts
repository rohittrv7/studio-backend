import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from './cloudinary.service';
import { UploadMediaDto } from './dto/upload-media.dto';

@Injectable()
export class MediaService {
  private readonly signedUrlExpiry: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly configService: ConfigService,
  ) {
    this.signedUrlExpiry = this.configService.get<number>(
      'CLOUDINARY_SIGNED_URL_EXPIRY',
      86400,
    );
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  async upload(
    studioOwnerId: string,
    galleryId: string,
    file: Express.Multer.File,
    dto: UploadMediaDto,
  ) {
    // Verify gallery exists and is owned by studioOwnerId
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
    });

    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${galleryId} not found`);
    }

    if (gallery.studioOwnerId !== studioOwnerId) {
      throw new ForbiddenException('You do not own this gallery');
    }

    // If folderId provided, verify folder belongs to this gallery
    if (dto.folderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: dto.folderId, galleryId, deletedAt: null },
      });
      if (!folder) {
        throw new NotFoundException(
          `Folder with id ${dto.folderId} not found in this gallery`,
        );
      }
    }

    // Upload to Cloudinary (will throw 413/415/502 on failure)
    const uploaded = await this.cloudinaryService.upload(
      file,
      studioOwnerId,
      galleryId,
      dto.mediaType,
    );

    // Generate thumbnail URL
    const thumbnailUrl = this.cloudinaryService.generateThumbnailUrl(
      uploaded.public_id,
      dto.mediaType,
    );

    // Persist MediaFile record
    const mediaFile = await this.prisma.mediaFile.create({
      data: {
        galleryId,
        folderId: dto.folderId ?? null,
        cloudinaryPublicId: uploaded.public_id,
        secureUrl: uploaded.secure_url,
        thumbnailUrl,
        mediaType: dto.mediaType === 'photo' ? 'PHOTO' : 'VIDEO',
        mimeType: file.mimetype,
        fileSize: file.size,
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        durationSeconds: uploaded.duration ?? null,
      },
    });

    return mediaFile;
  }

  // ─── Find All (paginated) ─────────────────────────────────────────────────

  async findAll(
    galleryId: string,
    requesterId: string,
    requesterRole: string,
    folderId?: string,
    page = 1,
    limit = 30,
  ) {
    // Verify requester can access the gallery
    const gallery = await this.assertGalleryAccess(
      galleryId,
      requesterId,
      requesterRole,
    );

    const skip = (page - 1) * limit;
    const where = {
      galleryId,
      deletedAt: null as null,
      ...(folderId === 'all'
        ? {}
        : { folderId: folderId || null }),
    };

    const [mediaFiles, total] = await Promise.all([
      this.prisma.mediaFile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mediaFile.count({ where }),
    ]);

    const data = mediaFiles.map((mf) => {
      let signedUrl = mf.secureUrl;
      let signedThumbnailUrl = mf.thumbnailUrl;

      if (!mf.secureUrl.startsWith('https://images.unsplash.com')) {
        try {
          signedUrl = this.cloudinaryService.generateSignedUrl(
            mf.cloudinaryPublicId,
            mf.mediaType === 'PHOTO' ? 'photo' : 'video',
            this.signedUrlExpiry,
          );
          signedThumbnailUrl = this.cloudinaryService.generateSignedThumbnailUrl(
            mf.cloudinaryPublicId,
            mf.mediaType === 'PHOTO' ? 'photo' : 'video',
            this.signedUrlExpiry,
          );
        } catch {
          throw new ServiceUnavailableException(
            'Failed to generate signed URLs. Please try again later.',
          );
        }
      }

      return {
        ...mf,
        secureUrl: signedUrl,
        signedUrl,
        thumbnailUrl: signedThumbnailUrl,
        downloadPermitted: gallery.downloadEnabled,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

  async findOne(
    galleryId: string,
    mediaId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const gallery = await this.assertGalleryAccess(
      galleryId,
      requesterId,
      requesterRole,
    );

    const mediaFile = await this.prisma.mediaFile.findFirst({
      where: { id: mediaId, galleryId, deletedAt: null },
    });

    if (!mediaFile) {
      throw new NotFoundException(`Media file with id ${mediaId} not found`);
    }

    let signedUrl = mediaFile.secureUrl;
    let signedThumbnailUrl = mediaFile.thumbnailUrl;

    if (!mediaFile.secureUrl.startsWith('https://images.unsplash.com')) {
      try {
        signedUrl = this.cloudinaryService.generateSignedUrl(
          mediaFile.cloudinaryPublicId,
          mediaFile.mediaType === 'PHOTO' ? 'photo' : 'video',
          this.signedUrlExpiry,
        );
        signedThumbnailUrl = this.cloudinaryService.generateSignedThumbnailUrl(
          mediaFile.cloudinaryPublicId,
          mediaFile.mediaType === 'PHOTO' ? 'photo' : 'video',
          this.signedUrlExpiry,
        );
      } catch {
        throw new ServiceUnavailableException(
          'Failed to generate signed URL. Please try again later.',
        );
      }
    }

    return {
      ...mediaFile,
      secureUrl: signedUrl,
      signedUrl,
      thumbnailUrl: signedThumbnailUrl,
      downloadPermitted: gallery.downloadEnabled,
    };
  }

  // ─── Remove (soft-delete) ─────────────────────────────────────────────────

  async remove(galleryId: string, mediaId: string, studioOwnerId: string) {
    // Verify gallery ownership
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, studioOwnerId, deletedAt: null },
    });

    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${galleryId} not found`);
    }

    const mediaFile = await this.prisma.mediaFile.findFirst({
      where: { id: mediaId, galleryId, deletedAt: null },
    });

    if (!mediaFile) {
      throw new NotFoundException(`Media file with id ${mediaId} not found`);
    }

    // Delete from Cloudinary
    await this.cloudinaryService.delete(mediaFile.cloudinaryPublicId);

    // Soft-delete the record
    await this.prisma.mediaFile.update({
      where: { id: mediaId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Media file deleted successfully' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Returns the gallery if the requester has access.
   * - studio_owner: must own the gallery
   * - customer: must be the assigned customer
   * Throws ForbiddenException / NotFoundException on failure.
   */
  private async assertGalleryAccess(
    galleryId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
    });

    if (!gallery) {
      // Return 403 to avoid oracle attacks (don't reveal 404 vs 403)
      throw new ForbiddenException('Access denied');
    }

    if (requesterRole === 'studio_owner') {
      if (gallery.studioOwnerId !== requesterId) {
        throw new ForbiddenException('Access denied');
      }
    } else {
      // customer role — must be the assigned customer OR have active QR link
      if (gallery.customerId !== requesterId) {
        const activeQr = await this.prisma.qrLink.findFirst({
          where: { galleryId, status: 'ACTIVE' },
        });
        if (!activeQr) {
          throw new ForbiddenException('Access denied');
        }
      }
    }

    return gallery;
  }
}
