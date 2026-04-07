import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NormalizedWebhookDto } from './dto/normalized-webhook.dto';
import { WebhookQueryDto } from './dto/webhook-query.dto';

@Injectable()
export class WebhooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWebhookLog(payload: NormalizedWebhookDto) {
    return this.prisma.webhookLog.create({
      data: {
        provider: payload.provider,
        eventType: payload.eventType,
        externalMessageId: payload.externalMessageId,
        conversationExternalId: payload.conversationExternalId,
        contactPhone: payload.contactPhone,
        contactName: payload.contactName,
        messageText: payload.messageText,
        messageType: payload.messageType,
        deliveryStatus: payload.deliveryStatus,
        direction: payload.direction,
        eventAt: payload.eventAt,
        rawPayload: payload.rawPayload,
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
      ...(query.contactPhone ? { contactPhone: query.contactPhone } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.webhookLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: query.sortOrder ?? 'desc' },
      }),
      this.prisma.webhookLog.count({ where }),
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
}