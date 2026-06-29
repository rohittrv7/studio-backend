import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './plans.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreatePlanDto) {
    return this.prisma.plan.create({
      data: {
        userId,
        name: dto.name,
        price: dto.price,
        description: dto.description,
        duration: dto.duration,
        deliverables: dto.deliverables,
      },
    });
  }

  async getMyPlans(userId: string) {
    return this.prisma.plan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(userId: string, id: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, userId },
    });

    if (!plan) {
      throw new NotFoundException(`Plan not found`);
    }

    return this.prisma.plan.delete({
      where: { id },
    });
  }
}
