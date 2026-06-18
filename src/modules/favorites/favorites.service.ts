import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../media/cloudinary.service';

@Injectable()
export class FavoritesService {
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

  // ─── Ownership/Access check ────────────────────────────────────────────────

  private async checkMediaAccess(
    userId: string,
    role: string,
    mediaFileId: string,
  ): Promise<boolean> {
    const isStudio = role === 'studio_owner';
    const mediaFile = await this.prisma.mediaFile.findFirst({
      where: {
        id: mediaFileId,
        deletedAt: null,
        gallery: {
          deletedAt: null,
          ...(isStudio
            ? { studioOwnerId: userId }
            : {
                OR: [
                  { customerId: userId },
                  { studioOwnerId: userId },
                ],
              }),
        },
      },
      select: { id: true },
    });
    return !!mediaFile;
  }

  private async assertMediaAccess(
    userId: string,
    role: string,
    mediaFileId: string,
  ): Promise<void> {
    const hasAccess = await this.checkMediaAccess(userId, role, mediaFileId);
    if (!hasAccess) {
      throw new ForbiddenException(
        'Media file does not belong to a gallery assigned to you',
      );
    }
  }

  // ─── Add ──────────────────────────────────────────────────────────────────

  async add(userId: string, role: string, mediaFileId: string) {
    await this.assertMediaAccess(userId, role, mediaFileId);

    const isStudio = role === 'studio_owner';
    const favorite = await this.prisma.favorite.upsert({
      where: isStudio
        ? { userId_mediaFileId: { userId, mediaFileId } }
        : { customerId_mediaFileId: { customerId: userId, mediaFileId } },
      create: isStudio
        ? { userId, mediaFileId }
        : { customerId: userId, mediaFileId },
      update: {}, // no-op if already exists
    });

    // Post-check validation
    const stillValid = await this.checkMediaAccess(userId, role, mediaFileId);
    if (!stillValid) {
      // Rollback
      await this.prisma.favorite.deleteMany({
        where: isStudio
          ? { userId, mediaFileId }
          : { customerId: userId, mediaFileId },
      });
      throw new ForbiddenException(
        'Media file does not belong to a gallery assigned to you',
      );
    }

    return {
      id: favorite.id,
      mediaFileId: favorite.mediaFileId,
      createdAt: favorite.createdAt,
    };
  }

  // ─── Remove ───────────────────────────────────────────────────────────────

  async remove(userId: string, role: string, mediaFileId: string) {
    await this.assertMediaAccess(userId, role, mediaFileId);

    const isStudio = role === 'studio_owner';
    await this.prisma.favorite.deleteMany({
      where: isStudio
        ? { userId, mediaFileId }
        : { customerId: userId, mediaFileId },
    });

    return { message: 'Favorite removed successfully' };
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  async list(userId: string, role: string) {
    const isStudio = role === 'studio_owner';
    const favorites = await this.prisma.favorite.findMany({
      where: isStudio
        ? {
            userId,
            mediaFile: {
              deletedAt: null,
              gallery: { deletedAt: null, studioOwnerId: userId },
            },
          }
        : {
            customerId: userId,
            mediaFile: {
              deletedAt: null,
              gallery: {
                deletedAt: null,
                OR: [
                  { customerId: userId },
                  { studioOwnerId: userId },
                ],
              },
            },
          },
      orderBy: { createdAt: 'desc' },
      include: {
        mediaFile: {
          select: {
            id: true,
            galleryId: true,
            folderId: true,
            cloudinaryPublicId: true,
            secureUrl: true,
            thumbnailUrl: true,
            mediaType: true,
            mimeType: true,
            fileSize: true,
            width: true,
            height: true,
            durationSeconds: true,
            createdAt: true,
            gallery: {
              select: {
                downloadEnabled: true,
              },
            },
          },
        },
      },
    });

    return favorites.map((fav) => {
      let signedUrl = fav.mediaFile.secureUrl;
      let signedThumbnailUrl = fav.mediaFile.thumbnailUrl;

      if (!fav.mediaFile.secureUrl.startsWith('https://images.unsplash.com')) {
        try {
          const type = fav.mediaFile.mediaType === 'PHOTO' ? 'photo' : 'video';
          signedUrl = this.cloudinaryService.generateSignedUrl(
            fav.mediaFile.cloudinaryPublicId,
            type,
            this.signedUrlExpiry,
          );
          signedThumbnailUrl = this.cloudinaryService.generateSignedThumbnailUrl(
            fav.mediaFile.cloudinaryPublicId,
            type,
            this.signedUrlExpiry,
          );
        } catch {
          // Fallback to stored values if signing fails
        }
      }

      return {
        id: fav.id,
        mediaFileId: fav.mediaFileId,
        createdAt: fav.createdAt,
        mediaFile: {
          id: fav.mediaFile.id,
          galleryId: fav.mediaFile.galleryId,
          folderId: fav.mediaFile.folderId,
          secureUrl: signedUrl,
          thumbnailUrl: signedThumbnailUrl,
          mediaType: fav.mediaFile.mediaType.toLowerCase(),
          mimeType: fav.mediaFile.mimeType,
          fileSize: fav.mediaFile.fileSize,
          width: fav.mediaFile.width,
          height: fav.mediaFile.height,
          durationSeconds: fav.mediaFile.durationSeconds,
          downloadPermitted: fav.mediaFile.gallery.downloadEnabled,
          downloadCount: 0,
          createdAt: fav.mediaFile.createdAt.toISOString(),
        },
      };
    });
  }
}
