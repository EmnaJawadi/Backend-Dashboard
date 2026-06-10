import { Injectable, Logger } from '@nestjs/common';
import {
  buildEvolutionInstanceLookupCandidates,
  findMatchingEvolutionInstance,
} from '../../../common/utils/evolution-instance.util';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NormalizedWebhookDto } from '../dto/normalized-webhook.dto';

@Injectable()
export class DeliveryStatusHandler {
  private readonly logger = new Logger(DeliveryStatusHandler.name);

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

  async handle(payload: NormalizedWebhookDto): Promise<void> {
    if (!payload.externalMessageId || !payload.deliveryStatus) {
      this.logger.warn('Delivery webhook skipped because externalMessageId/status is missing');
      return;
    }

    const companyId = payload.instanceName
      ? await this.findCompanyIdByInstance(payload.instanceName)
      : null;

    const message = await this.prisma.message.findFirst({
      where: {
        externalMessageId: payload.externalMessageId,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!message) {
      this.logger.warn(
        `Delivery status webhook received for unknown message externalId=${payload.externalMessageId}`,
      );
      return;
    }

    const now = payload.eventAt ?? new Date();

    await this.prisma.message.update({
      where: { id: message.id },
      data: {
        deliveryStatus: payload.deliveryStatus,
      },
    });

    await this.prisma.conversation.update({
      where: { id: message.conversationId },
      data: {
        lastMessageAt: now,
        updatedAt: now,
      },
    });

    this.logger.log(
      `Delivery status updated: message=${payload.externalMessageId} status=${payload.deliveryStatus}`,
    );
  }
}
