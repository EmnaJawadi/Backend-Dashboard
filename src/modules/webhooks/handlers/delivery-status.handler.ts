import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NormalizedWebhookDto } from '../dto/normalized-webhook.dto';

@Injectable()
export class DeliveryStatusHandler {
  private readonly logger = new Logger(DeliveryStatusHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(payload: NormalizedWebhookDto): Promise<void> {
    if (!payload.externalMessageId || !payload.deliveryStatus) {
      this.logger.warn('Delivery webhook skipped because externalMessageId/status is missing');
      return;
    }

    const message = await this.prisma.message.findFirst({
      where: {
        externalMessageId: payload.externalMessageId,
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
