import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateAiRunDto } from './dto/create-ai-run.dto';
import { AiRunQueryDto } from './dto/ai-run-query.dto';

@Injectable()
export class AiRunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAiRunDto) {
    return this.prisma.aiRun.create({
      data: {
        conversationId: data.conversationId ?? null,
        contactId: data.contactId ?? null,
        prompt: data.prompt ?? null,
        response: data.response ?? null,
        provider: data.provider ?? 'gemini',
        model: data.model ?? 'gemini-1.5-flash',
        status: data.status ?? 'success',
        latencyMs: data.latencyMs ?? null,
        tokensUsed: data.tokensUsed ?? null,
        confidenceScore: data.confidenceScore ?? null,
        estimatedCost: data.estimatedCost ?? null,
        blockedReason: data.blockedReason ?? null,
        metadata: data.metadata ?? null,
      },
    });
  }

  async findMany(query: AiRunQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.model ? { model: query.model } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.aiRun.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: query.sortOrder ?? 'desc' },
      }),
      this.prisma.aiRun.count({ where }),
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
    return this.prisma.aiRun.findUnique({
      where: { id },
    });
  }

  async remove(id: string) {
    return this.prisma.aiRun.delete({
      where: { id },
    });
  }
}