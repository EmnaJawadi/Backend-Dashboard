import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { WebhookQueryDto } from './dto/webhook-query.dto';
import { NormalizedWebhookDto } from './dto/normalized-webhook.dto';

@Injectable()
export class WebhooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWebhookLog(data: NormalizedWebhookDto) {
    return this.prisma.webhookEvent.create({
      data: {
        provider: data.provider ?? null,
        eventType: data.eventType ?? null,
        externalEventId: data.externalMessageId ?? null,
        payload: {
          conversationExternalId: data.conversationExternalId,
          contactPhone: data.contactPhone,
          contactName: data.contactName,
          messageText: data.messageText,
          messageType: data.messageType,
          deliveryStatus: data.deliveryStatus,
          direction: data.direction,
          eventAt: data.eventAt,
          rawPayload: data.rawPayload as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
        processingStatus: 'pending',
        errorMessage: null,
        receivedAt: new Date(),
        processedAt: null,
      },
    });
  }

  async markProcessed(id: string) {
    return this.prisma.webhookEvent.update({
      where: { id },
      data: {
        processingStatus: 'processed',
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  async markFailed(id: string, errorMessage: string) {
    return this.prisma.webhookEvent.update({
      where: { id },
      data: {
        processingStatus: 'failed',
        processedAt: new Date(),
        errorMessage,
      },
    });
  }

  async findMany(query: WebhookQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.contactPhone
        ? {
            payload: {
              path: ['contactPhone'],
              string_contains: query.contactPhone,
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.webhookEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          receivedAt: query.sortOrder ?? 'desc',
        },
      }),
      this.prisma.webhookEvent.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
