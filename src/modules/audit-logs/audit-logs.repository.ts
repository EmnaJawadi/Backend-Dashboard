import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Injectable()
export class AuditLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAuditLogDto) {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        userId: data.userId ?? null,
        metadata: data.metadata ?? null,
      },
    });
  }

  async findMany(query: AuditLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search } },
              { entityType: { contains: query.search } },
              { entityId: { contains: query.search } },
              { userId: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: query.sortOrder ?? 'desc',
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

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

  async findById(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
    });
  }

  async remove(id: string) {
    return this.prisma.auditLog.delete({
      where: { id },
    });
  }
}