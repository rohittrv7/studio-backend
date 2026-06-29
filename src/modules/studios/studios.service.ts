import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StudiosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(location?: string, bookingDate?: string) {
    const where: any = {
      role: 'STUDIO_OWNER',
      studioName: { not: null },
    };

    if (location && location.trim().length > 0) {
      where.location = {
        contains: location.trim(),
        mode: 'insensitive',
      };
    }

    let results = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        profilePhoto: true,
        studioName: true,
        location: true,
        description: true,
        bookingsAsStudio: {
          where: {
            status: 'CONFIRMED',
          },
          select: {
            bookingDate: true,
          },
        },
      },
      orderBy: { studioName: 'asc' },
    });

    if (bookingDate) {
      const searchTime = new Date(bookingDate).getTime();
      const threeHoursMs = 3 * 60 * 60 * 1000;
      results = results.filter(studio => {
        const hasOverlap = studio.bookingsAsStudio.some(booking => {
          const bookingTime = new Date(booking.bookingDate).getTime();
          return Math.abs(bookingTime - searchTime) < threeHoursMs;
        });
        return !hasOverlap;
      });
    }

    return results.map(({ bookingsAsStudio, ...rest }) => rest);
  }


  async findOne(id: string) {
    const studio = await this.prisma.user.findFirst({
      where: { id, role: 'STUDIO_OWNER' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        profilePhoto: true,
        studioName: true,
        location: true,
        description: true,
        plans: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!studio) {
      throw new NotFoundException('Studio not found');
    }

    // Find showcase galleries
    const showcaseGalleries = await this.prisma.gallery.findMany({
      where: { studioOwnerId: id, showcase: true, deletedAt: null },
      include: {
        _count: { select: { mediaFiles: { where: { deletedAt: null } } } },
        mediaFiles: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { secureUrl: true, thumbnailUrl: true },
        },
      },
    });

    // Find demo folder and media files
    let demoMedia: any[] = [];
    if (studio.studioName) {
      const folder = await this.prisma.folder.findFirst({
        where: {
          name: { equals: studio.studioName, mode: 'insensitive' },
          gallery: { studioOwnerId: studio.id, deletedAt: null },
          deletedAt: null,
        },
        include: {
          mediaFiles: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (folder) {
        demoMedia = folder.mediaFiles;
      }
    }

    return {
      ...studio,
      showcaseGalleries,
      demoMedia,
    };
  }
}
