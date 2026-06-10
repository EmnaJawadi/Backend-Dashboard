import { Injectable } from '@nestjs/common';
import {
  buildEvolutionInstanceLookupCandidates,
  findMatchingEvolutionInstance,
} from '../../common/utils/evolution-instance.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { WebhookQueryDto } from './dto/webhook-query.dto';
import { NormalizedWebhookDto } from './dto/normalized-webhook.dto';

@Injectable()
export class WebhooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async findCompanyIdByInstance(instanceName: string) {
    const candidates = buildEvolutionInstanceLookupCandidates(instanceName);
    const exact = candidates.length
      ? await this.prisma.companyWhatsappInstance.findFirst({
          where: {
            OR: candidates.map((candidate) => ({
              evolutionInstanceName: candidate,
            })),
          },
          select: {
            companyId: true,
            evolutionInstanceName: true,
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (exact?.companyId) {
      return exact.companyId;
    }

    const instances = await this.prisma.companyWhatsappInstance.findMany({
      select: {
        companyId: true,
        evolutionInstanceName: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return findMatchingEvolutionInstance(instances, instanceName)?.companyId ?? null;
  }

  async createWebhookLog(data: NormalizedWebhookDto) {
    const companyId = data.instanceName
      ? await this.findCompanyIdByInstance(data.instanceName)
      : null;

    return this.prisma.webhookEvent.create({
      data: {
        companyId,
        provider: data.provider ?? null,
        eventType: data.eventType ?? null,
        instanceName: data.instanceName ?? null,
        externalEventId: data.externalMessageId ?? null,
        payload: {
          instanceName: data.instanceName,
          conversationExternalId: data.conversationExternalId,
          contactPhone: data.contactPhone,
          contactName: data.contactName,
          messageText: data.messageText,
          messageType: data.messageType,
          caption: data.caption,
          mediaUrl: data.mediaUrl,
          mediaId: data.mediaId,
          mimeType: data.mimeType,
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

  async findMany(query: WebhookQueryDto, companyId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(companyId ? { companyId } : {}),
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
