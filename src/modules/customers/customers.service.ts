import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(studioOwnerId: string, dto: CreateCustomerDto) {
    // Validate unique phone per studio owner
    const existing = await this.prisma.customer.findUnique({
      where: { studioOwnerId_phone: { studioOwnerId, phone: dto.phone } },
    });

    if (existing) {
      throw new ConflictException(
        'A customer with this phone number already exists for your studio',
      );
    }

    const customer = await this.prisma.customer.create({
      data: {
        studioOwnerId,
        name: dto.name,
        phone: dto.phone,
      },
    });

    return customer;
  }

  // ─── Find All (paginated) ─────────────────────────────────────────────────

  async findAll(studioOwnerId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where: { studioOwnerId, deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { galleries: { where: { deletedAt: null } } },
          },
        },
      }),
      this.prisma.customer.count({
        where: { studioOwnerId, deletedAt: null },
      }),
    ]);

    const data = customers.map(({ _count, ...customer }) => ({
      ...customer,
      galleryCount: _count.galleries,
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

  async findOne(id: string, studioOwnerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, studioOwnerId, deletedAt: null },
      include: {
        _count: {
          select: { galleries: { where: { deletedAt: null } } },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with id ${id} not found`);
    }

    const { _count, ...rest } = customer;
    return { ...rest, galleryCount: _count.galleries };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, studioOwnerId: string, dto: UpdateCustomerDto) {
    // Ensure the customer belongs to this studio owner and is not deleted
    const customer = await this.prisma.customer.findFirst({
      where: { id, studioOwnerId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with id ${id} not found`);
    }

    // If phone is being changed, check uniqueness
    if (dto.phone && dto.phone !== customer.phone) {
      const duplicate = await this.prisma.customer.findUnique({
        where: { studioOwnerId_phone: { studioOwnerId, phone: dto.phone } },
      });

      if (duplicate) {
        throw new ConflictException(
          'A customer with this phone number already exists for your studio',
        );
      }
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
      },
    });
  }

  // ─── Remove (soft-delete) ─────────────────────────────────────────────────

  async remove(id: string, studioOwnerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, studioOwnerId, deletedAt: null },
      include: {
        galleries: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with id ${id} not found`);
    }

    const galleryIds = customer.galleries.map((g) => g.id);
    const now = new Date();

    await this.prisma.$transaction([
      // Revoke all QR links for customer's galleries
      this.prisma.qrLink.updateMany({
        where: {
          galleryId: { in: galleryIds },
          status: 'ACTIVE',
        },
        data: {
          status: 'REVOKED',
          revokedAt: now,
        },
      }),
      // Soft-delete the customer
      this.prisma.customer.update({
        where: { id },
        data: { deletedAt: now },
      }),
    ]);

    return { message: 'Customer deleted successfully' };
  }
}
