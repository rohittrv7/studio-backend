import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGalleryDto } from './dto/create-gallery.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';
import { AssignGalleryDto } from './dto/assign-gallery.dto';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Injectable()
export class GalleriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(studioOwnerId: string, dto: CreateGalleryDto) {
    return this.prisma.gallery.create({
      data: {
        studioOwnerId,
        name: dto.name,
      },
      select: {
        id: true,
        name: true,
        customerId: true,
        downloadEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ─── Find All (paginated) ─────────────────────────────────────────────────

  async findAll(userId: string, role: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    let where: any = { deletedAt: null };
    if (role === 'studio_owner') {
      where.studioOwnerId = userId;
    } else {
      let phone = '';
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        phone = user.phone;
      } else {
        const customer = await this.prisma.customer.findUnique({ where: { id: userId } });
        if (customer) {
          phone = customer.phone;
        }
      }
      where.OR = [
        { customerId: userId },
        { customer: { phone } },
      ];
    }

    const [galleries, total] = await Promise.all([
      this.prisma.gallery.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, phone: true },
          },
          _count: {
            select: { mediaFiles: { where: { deletedAt: null } } },
          },
          mediaFiles: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { thumbnailUrl: true },
          },
        },
      }),
      this.prisma.gallery.count({
        where,
      }),
    ]);

    const data = galleries.map(({ _count, mediaFiles, ...gallery }) => ({
      ...gallery,
      mediaCount: _count.mediaFiles,
      coverThumbnailUrl: mediaFiles[0]?.thumbnailUrl ?? null,
    }));

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

  /**
   * Returns the gallery if:
   *   - requestingUser is a studio_owner AND owns the gallery, OR
   *   - requestingUser is a customer AND the gallery is assigned to them.
   * Otherwise throws ForbiddenException (403) — no gallery data is included in the error.
   */
  async findOne(id: string, requestingUser: JwtPayload) {
    const gallery = await this.prisma.gallery.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
        _count: {
          select: { mediaFiles: { where: { deletedAt: null } } },
        },
        mediaFiles: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { thumbnailUrl: true },
        },
      },
    });

    // Resolve access — do NOT reveal 404 vs 403 distinction to avoid oracle attacks
    if (!gallery) {
      throw new ForbiddenException('Access denied');
    }

    if (requestingUser.role === 'studio_owner') {
      if (gallery.studioOwnerId !== requestingUser.sub) {
        throw new ForbiddenException('Access denied');
      }
    } else {
      // customer role — must be the assigned customer OR have active QR link OR phone matches
      let phone = '';
      const user = await this.prisma.user.findUnique({ where: { id: requestingUser.sub } });
      if (user) {
        phone = user.phone;
      } else {
        const customer = await this.prisma.customer.findUnique({ where: { id: requestingUser.sub } });
        if (customer) {
          phone = customer.phone;
        }
      }

      const isAssigned = gallery.customerId === requestingUser.sub || (gallery.customer && gallery.customer.phone === phone);
      if (!isAssigned) {
        const activeQr = await this.prisma.qrLink.findFirst({
          where: { galleryId: id, status: 'ACTIVE' },
        });
        if (!activeQr) {
          throw new ForbiddenException('Access denied');
        }
      }
    }

    const { _count, mediaFiles, ...rest } = gallery;
    return {
      ...rest,
      mediaCount: _count.mediaFiles,
      coverThumbnailUrl: mediaFiles[0]?.thumbnailUrl ?? null,
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, studioOwnerId: string, dto: UpdateGalleryDto) {
    const gallery = await this.prisma.gallery.findFirst({
      where: { id, studioOwnerId, deletedAt: null },
    });

    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${id} not found`);
    }

    return this.prisma.gallery.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
        ...(dto.downloadEnabled !== undefined && {
          downloadEnabled: dto.downloadEnabled,
        }),
        ...(dto.showcase !== undefined && { showcase: dto.showcase }),
      },
      select: {
        id: true,
        name: true,
        customerId: true,
        downloadEnabled: true,
        showcase: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ─── Remove (soft-delete with cascade) ───────────────────────────────────

  async remove(id: string, studioOwnerId: string) {
    const gallery = await this.prisma.gallery.findFirst({
      where: { id, studioOwnerId, deletedAt: null },
    });

    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${id} not found`);
    }

    const now = new Date();

    await this.prisma.$transaction([
      // 1. Soft-delete the gallery itself
      this.prisma.gallery.update({
        where: { id },
        data: { deletedAt: now },
      }),
      // 2. Soft-delete all nested Folders for this gallery
      this.prisma.folder.updateMany({
        where: { galleryId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      // 3. Soft-delete all MediaFile records for this gallery
      this.prisma.mediaFile.updateMany({
        where: { galleryId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      // 4. Revoke all QrLinks for this gallery
      this.prisma.qrLink.updateMany({
        where: { galleryId: id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      }),
    ]);

    return { message: 'Gallery deleted successfully' };
  }

  // ─── Assign ───────────────────────────────────────────────────────────────

  async assign(id: string, studioOwnerId: string, dto: AssignGalleryDto) {
    const gallery = await this.prisma.gallery.findFirst({
      where: { id, studioOwnerId, deletedAt: null },
      include: {
        studioOwner: { select: { id: true, name: true } },
      },
    });

    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${id} not found`);
    }

    const updated = await this.prisma.gallery.update({
      where: { id },
      data: {
        customerId: dto.customerId,
        ...(dto.downloadEnabled !== undefined && { downloadEnabled: dto.downloadEnabled }),
      },
      select: {
        id: true,
        customerId: true,
        updatedAt: true,
      },
    });

    // Emit gallery.assigned event for NotificationsService
    this.eventEmitter.emit('gallery.assigned', {
      galleryId: id,
      customerId: dto.customerId,
      galleryName: gallery.name,
      studioOwnerId,
    });

    return updated;
  }
}
