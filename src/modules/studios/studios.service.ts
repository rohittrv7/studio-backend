import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StudiosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(location?: string) {
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

    return this.prisma.user.findMany({
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
      },
      orderBy: { studioName: 'asc' },
    });
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
      demoMedia,
    };
  }
}
