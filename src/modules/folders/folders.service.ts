import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';

export interface FolderTreeNode {
  id: string;
  name: string;
  depth: number;
  mediaCount: number;
  children: FolderTreeNode[];
}

@Injectable()
export class FoldersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(galleryId: string, dto: CreateFolderDto, studioOwnerId: string) {
    // Verify gallery belongs to this studio owner
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, studioOwnerId, deletedAt: null },
    });
    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${galleryId} not found`);
    }

    let depth = 0;

    if (dto.parentFolderId) {
      const parent = await this.prisma.folder.findFirst({
        where: { id: dto.parentFolderId, galleryId, deletedAt: null },
      });
      if (!parent) {
        throw new NotFoundException(`Parent folder with id ${dto.parentFolderId} not found`);
      }
      // Max depth is 4 (0-indexed), so depth 5+ is forbidden.
      // parent.depth + 1 >= 5 means the new folder would be at depth 5 or deeper.
      if (parent.depth + 1 >= 5) {
        throw new UnprocessableEntityException(
          'Maximum folder nesting depth of 5 levels exceeded',
        );
      }
      depth = parent.depth + 1;
    }

    return this.prisma.folder.create({
      data: {
        galleryId,
        parentId: dto.parentFolderId ?? null,
        name: dto.name,
        depth,
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        depth: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ─── Get Tree ─────────────────────────────────────────────────────────────

  async getTree(
    galleryId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<{ folders: FolderTreeNode[] }> {
    // Verify gallery access
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
    });

    if (!gallery) {
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

    // Fetch all non-deleted folders for the gallery
    const folders = await this.prisma.folder.findMany({
      where: { galleryId, deletedAt: null },
      select: {
        id: true,
        name: true,
        depth: true,
        parentId: true,
        _count: {
          select: { mediaFiles: { where: { deletedAt: null } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Build tree in-memory
    const nodeMap = new Map<string, FolderTreeNode>();

    // First pass: create all nodes
    for (const folder of folders) {
      nodeMap.set(folder.id, {
        id: folder.id,
        name: folder.name,
        depth: folder.depth,
        mediaCount: folder._count.mediaFiles,
        children: [],
      });
    }

    // Second pass: wire up parent-child relationships
    const roots: FolderTreeNode[] = [];
    for (const folder of folders) {
      const node = nodeMap.get(folder.id)!;
      if (folder.parentId && nodeMap.has(folder.parentId)) {
        nodeMap.get(folder.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return { folders: roots };
  }

  // ─── Rename ───────────────────────────────────────────────────────────────

  async rename(
    galleryId: string,
    folderId: string,
    dto: RenameFolderDto,
    studioOwnerId: string,
  ) {
    // Verify gallery belongs to studio owner
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, studioOwnerId, deletedAt: null },
    });
    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${galleryId} not found`);
    }

    // Verify folder belongs to gallery and is not soft-deleted
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, galleryId, deletedAt: null },
    });
    if (!folder) {
      throw new NotFoundException(`Folder with id ${folderId} not found`);
    }

    return this.prisma.folder.update({
      where: { id: folderId },
      data: { name: dto.name },
      select: {
        id: true,
        name: true,
        parentId: true,
        depth: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ─── Remove ───────────────────────────────────────────────────────────────

  async remove(galleryId: string, folderId: string, studioOwnerId: string) {
    // Verify gallery belongs to studio owner
    const gallery = await this.prisma.gallery.findFirst({
      where: { id: galleryId, studioOwnerId, deletedAt: null },
    });
    if (!gallery) {
      throw new NotFoundException(`Gallery with id ${galleryId} not found`);
    }

    // Verify target folder belongs to gallery (including already-deleted ones for idempotency,
    // but we still check if it was ever in this gallery)
    const targetFolder = await this.prisma.folder.findFirst({
      where: { id: folderId, galleryId },
    });
    if (!targetFolder) {
      throw new NotFoundException(`Folder with id ${folderId} not found`);
    }

    // Collect all descendant folder IDs using iterative BFS
    const allFolderIds: string[] = [folderId];
    const queue: string[] = [folderId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = await this.prisma.folder.findMany({
        where: { parentId: currentId, galleryId, deletedAt: null },
        select: { id: true },
      });
      for (const child of children) {
        allFolderIds.push(child.id);
        queue.push(child.id);
      }
    }

    const now = new Date();

    // Single transaction: soft-delete all folders and their media files
    await this.prisma.$transaction([
      this.prisma.folder.updateMany({
        where: { id: { in: allFolderIds }, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.mediaFile.updateMany({
        where: { folderId: { in: allFolderIds }, deletedAt: null },
        data: { deletedAt: now },
      }),
    ]);

    return { message: 'Folder deleted successfully' };
  }
}
