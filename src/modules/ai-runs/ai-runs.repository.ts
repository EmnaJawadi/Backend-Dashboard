import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CreateAiRunDto } from './dto/create-ai-run.dto';
import { AiRunQueryDto } from './dto/ai-run-query.dto';

@Injectable()
export class AiRunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAiRunDto) {
    const scope = await this.resolveWriteScope(data);

    return this.prisma.aiRun.create({
      data: {
        companyId: scope.companyId,
        conversationId: scope.conversationId,
        messageId: scope.messageId,
        contactId: scope.contactId,
        inputText: data.prompt ?? null,
        inputType: data.inputType ?? null,
        normalizedMessage: data.normalizedMessage ?? null,
        detectedLanguage: data.detectedLanguage ?? null,
        outputText: data.response ?? null,
        intent: data.intent ?? data.status ?? null,
        provider: data.provider ?? null,
        model: data.model ?? null,
        errorMessage: data.errorMessage ?? null,
        fallbackUsed: data.fallbackUsed ?? null,
        responseMode: data.responseMode ?? null,
        needsRag: data.needsRag ?? null,
        ragSources: data.ragSources
          ? (data.ragSources as Prisma.InputJsonValue)
          : undefined,
        canAnswer: data.canAnswer ?? null,
        orderIntent: data.orderIntent ?? null,
        usedKb: data.usedKb ?? null,
        sourceArticleIds: data.sourceArticleIds
          ? (data.sourceArticleIds as Prisma.InputJsonValue)
          : undefined,
        sourceChunkIds: data.sourceChunkIds
          ? (data.sourceChunkIds as Prisma.InputJsonValue)
          : undefined,
        retrievedChunksPreview: data.retrievedChunksPreview
          ? (data.retrievedChunksPreview as Prisma.InputJsonValue)
          : undefined,
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
        rawResponse: (data.rawResponse ?? data.metadata)
          ? ((data.rawResponse ?? data.metadata) as Prisma.InputJsonValue)
          : undefined,
        createdAt: new Date(),
      },
    });
  }

  private async resolveWriteScope(data: CreateAiRunDto) {
    const conversationId = data.conversationId?.trim();
    const messageId = data.messageId?.trim();
    const requestedCompanyId = data.companyId?.trim();

    if (!conversationId || !messageId) {
      throw new BadRequestException(
        'conversationId and messageId are required to create an AI run',
      );
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        ...(requestedCompanyId ? { companyId: requestedCompanyId } : {}),
      },
      select: {
        id: true,
        companyId: true,
        contactId: true,
      },
    });

    if (!conversation?.companyId) {
      throw new BadRequestException(
        'AI run conversation must belong to the requested company',
      );
    }

    if (data.contactId?.trim() && data.contactId.trim() !== conversation.contactId) {
      throw new BadRequestException(
        'AI run contact must belong to its conversation',
      );
    }

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        companyId: conversation.companyId,
        conversationId: conversation.id,
      },
      select: { id: true },
    });

    if (!message) {
      throw new BadRequestException(
        'AI run message must belong to its conversation and company',
      );
    }

    return {
      companyId: conversation.companyId,
      conversationId: conversation.id,
      messageId: message.id,
      contactId: conversation.contactId,
    };
  }

  async findMany(query: AiRunQueryDto, companyId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.AiRunWhereInput = {
      ...(companyId ? { companyId } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.model ? { model: query.model } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.status ? { status: query.status } : {}),
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

  async findById(id: string, companyId?: string) {
    return this.prisma.aiRun.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  async remove(id: string, companyId?: string) {
    const record = await this.findById(id, companyId);

    if (!record) {
      return null;
    }

    return this.prisma.aiRun.delete({ where: { id: record.id } });
  }
}
