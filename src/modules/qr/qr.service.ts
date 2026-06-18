import * as crypto from 'crypto';
import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Generate ─────────────────────────────────────────────────────────────

  async generate(
    galleryId: string,
    studioOwnerId: string,
    folderId?: string,
    mediaFileId?: string,
  ) {
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, studioOwnerId, deletedAt: null },
    });

    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${galleryId} not found`);
    }

    if (folderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: folderId, galleryId, deletedAt: null },
      });
      if (!folder) {
        throw new NotFoundException(`Folder with id ${folderId} not found in this gallery`);
      }
    }

    if (mediaFileId) {
      const media = await this.prisma.mediaFile.findFirst({
        where: { id: mediaFileId, galleryId, deletedAt: null },
      });
      if (!media) {
        throw new NotFoundException(`Media file with id ${mediaFileId} not found in this gallery`);
      }
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();

    const whereActive = {
      galleryId,
      status: 'ACTIVE' as const,
      folderId: folderId ?? null,
      mediaFileId: mediaFileId ?? null,
    };

    await this.prisma.$transaction([
      // Revoke any existing ACTIVE QrLink for this specific target
      this.prisma.qrLink.updateMany({
        where: whereActive,
        data: { status: 'REVOKED', revokedAt: now },
      }),
      // Insert new ACTIVE QrLink
      this.prisma.qrLink.create({
        data: {
          galleryId,
          folderId: folderId ?? null,
          mediaFileId: mediaFileId ?? null,
          token,
          status: 'ACTIVE',
        },
      }),
    ]);

    const deepLink = `studiogallery://gallery/${token}`;
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const fallbackUrl = `${baseUrl}/api/v1/qr/redirect/${token}`;

    const qrImageUrl = await QRCode.toDataURL(deepLink, { width: 512 });

    return { qrImageUrl, token, deepLink, fallbackUrl };
  }

  // ─── Revoke ───────────────────────────────────────────────────────────────

  async revoke(galleryId: string, studioOwnerId: string) {
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, studioOwnerId, deletedAt: null },
    });

    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${galleryId} not found`);
    }

    const qrLink = await this.prisma.qrLink.findFirst({
      where: { galleryId, status: 'ACTIVE' },
    });

    if (!qrLink) {
      throw new NotFoundException(`No active QR link found for gallery ${galleryId}`);
    }

    return this.prisma.qrLink.update({
      where: { id: qrLink.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  // ─── Validate ─────────────────────────────────────────────────────────────

  async validate(token: string) {
    const qrLink = await this.prisma.qrLink.findUnique({
      where: { token },
    });

    if (!qrLink) {
      throw new ForbiddenException('Invalid QR token');
    }

    if (qrLink.status === 'REVOKED') {
      throw new GoneException('QR link has been revoked');
    }

    if (qrLink.status !== 'ACTIVE') {
      throw new ForbiddenException('QR link is not active');
    }

    const gallery = await this.prisma.gallery.findFirst({
      where: { id: qrLink.galleryId, deletedAt: null },
    });

    if (!gallery) {
      throw new ForbiddenException('Gallery has been deleted');
    }

    if (gallery.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: gallery.customerId },
      });

      if (customer?.isLocked) {
        throw new ForbiddenException('Customer account is locked');
      }
    }

    return {
      valid: true,
      galleryId: gallery.id,
      galleryName: gallery.name,
      folderId: qrLink.folderId,
      mediaFileId: qrLink.mediaFileId,
    };
  }

  // ─── Redirect ─────────────────────────────────────────────────────────────

  redirect(token: string, userAgent: string) {
    const iosUrl = process.env.APP_STORE_URL || 'https://apps.apple.com';
    const androidUrl = process.env.PLAY_STORE_URL || 'https://play.google.com';

    let platform: 'ios' | 'android' | 'unknown' = 'unknown';

    if (/iphone|ipad|ipod/i.test(userAgent)) {
      platform = 'ios';
    } else if (/android/i.test(userAgent)) {
      platform = 'android';
    }

    return { platform, iosUrl, androidUrl };
  }
}
