import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface GalleryAnalyticsResult {
  galleryId: string;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  totalViewCount: number;
  totalDownloadCount: number;
  viewedStatus: 'viewed' | 'not_yet_viewed';
  mediaDownloads: { mediaFileId: string; downloadCount: number }[];
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Req 15.1, 15.2, 15.3, 15.5 — record a gallery view for a customer.
   *
   * Uses setImmediate to return immediately (202) and processes the upsert
   * asynchronously, ensuring no more than 100ms added latency to the caller.
   *
   * On first view: sets firstViewedAt = now.
   * On subsequent views: updates lastViewedAt = now and increments viewCount.
   */
  recordView(userTableId: string, galleryId: string): void {
    setImmediate(async () => {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userTableId },
          select: { phone: true },
        });
        if (!user) return;

        const gallery = await this.prisma.gallery.findUnique({
          where: { id: galleryId },
          select: { studioOwnerId: true },
        });
        if (!gallery) return;

        const customer = await this.prisma.customer.findFirst({
          where: {
            phone: user.phone,
            studioOwnerId: gallery.studioOwnerId,
          },
          select: { id: true },
        });

        if (!customer) return;

        const now = new Date();
        await this.prisma.galleryView.upsert({
          where: {
            galleryId_customerId: { galleryId, customerId: customer.id },
          },
          create: {
            galleryId,
            customerId: customer.id,
            firstViewedAt: now,
            lastViewedAt: now,
            viewCount: 1,
          },
          update: {
            lastViewedAt: now,
            viewCount: { increment: 1 },
          },
        });
      } catch (err: unknown) {
        console.error('[AnalyticsService] recordView failed:', err);
      }
    });
  }

  /**
   * Req 15.4, 15.6 — return aggregated analytics for a gallery.
   *
   * Verifies that the requesting user owns the gallery.
   * Returns all six required fields.
   */
  async getGalleryAnalytics(
    galleryId: string,
    studioOwnerId: string,
  ): Promise<GalleryAnalyticsResult> {
    // Verify gallery exists and is owned by the requester
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
      select: { id: true, studioOwnerId: true },
    });

    if (!gallery) {
      throw new NotFoundException('Gallery not found');
    }

    if (gallery.studioOwnerId !== studioOwnerId) {
      throw new ForbiddenException('You do not own this gallery');
    }

    // Aggregate GalleryView rows for this gallery
    const viewRows = await this.prisma.galleryView.findMany({
      where: { galleryId },
      select: {
        firstViewedAt: true,
        lastViewedAt: true,
        viewCount: true,
      },
    });

    const totalViewCount = viewRows.reduce((sum, r) => sum + r.viewCount, 0);

    // Req 15.6 — null timestamps when never viewed
    const firstViewedAt =
      totalViewCount > 0
        ? viewRows.reduce<Date | null>((earliest, r) => {
            return earliest === null || r.firstViewedAt < earliest
              ? r.firstViewedAt
              : earliest;
          }, null)
        : null;

    const lastViewedAt =
      totalViewCount > 0
        ? viewRows.reduce<Date | null>((latest, r) => {
            return latest === null || r.lastViewedAt > latest
              ? r.lastViewedAt
              : latest;
          }, null)
        : null;

    // Aggregate MediaFile download counts for this gallery
    const mediaFiles = await this.prisma.mediaFile.findMany({
      where: { galleryId, deletedAt: null },
      select: {
        id: true,
        downloadCount: true,
      },
    });

    const totalDownloadCount = mediaFiles.reduce(
      (sum, m) => sum + m.downloadCount,
      0,
    );

    const mediaDownloads = mediaFiles.map((m) => ({
      mediaFileId: m.id,
      downloadCount: m.downloadCount,
    }));

    // Req 15.6 — viewedStatus derived solely from totalViewCount
    const viewedStatus: 'viewed' | 'not_yet_viewed' =
      totalViewCount > 0 ? 'viewed' : 'not_yet_viewed';

    return {
      galleryId,
      firstViewedAt,
      lastViewedAt,
      totalViewCount,
      totalDownloadCount,
      viewedStatus,
      mediaDownloads,
    };
  }
}
