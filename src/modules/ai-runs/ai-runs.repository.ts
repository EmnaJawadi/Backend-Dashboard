import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CreateAiRunDto } from './dto/create-ai-run.dto';
import { AiRunQueryDto } from './dto/ai-run-query.dto';

@Injectable()
export class AiRunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAiRunDto) {
    const companyId = await this.resolveExistingCompanyId(data.companyId);

    return this.prisma.aiRun.create({
      data: {
        companyId,
        conversationId: data.conversationId ?? '',
        messageId: data.messageId ?? data.contactId ?? '',
        inputText: data.prompt ?? null,
        inputType: data.inputType ?? null,
        outputText: data.response ?? null,
        intent: data.intent ?? data.status ?? null,
        provider: data.provider ?? null,
        model: data.model ?? null,
        status: data.status ?? null,
        reason: data.reason ?? null,
        shouldSendMessage: data.shouldSendMessage ?? null,
        imageAnalysisResult: data.imageAnalysisResult
          ? (data.imageAnalysisResult as Prisma.InputJsonValue)
          : undefined,
        matchedProductId: data.matchedProductId ?? null,
        promptTokens: data.promptTokens ?? null,
        completionTokens: data.completionTokens ?? null,
        totalTokens: data.tokensUsed ?? null,
        latencyMs: data.latencyMs ?? null,
        confidenceScore: data.confidenceScore ?? null,
        blockedReason: data.blockedReason ?? null,
        handoffRequired: data.handoffRequired ?? null,
        tagsToApply: data.tagsToApply
          ? (data.tagsToApply as Prisma.InputJsonValue)
          : undefined,
        rawResponse: data.metadata
          ? (data.metadata as Prisma.InputJsonValue)
          : undefined,
        createdAt: new Date(),
      },
    });
  }

  private async resolveExistingCompanyId(companyId?: string | null) {
    const normalizedCompanyId = companyId?.trim();

    if (!normalizedCompanyId) {
      return null;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { id: true },
    });

    return company?.id ?? null;
  }

  async findMany(query: AiRunQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.model ? { model: query.model } : {}),
      ...(query.provider ? { model: { contains: query.provider } } : {}),
      ...(query.status ? { intent: query.status } : {}),
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
