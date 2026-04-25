import { Injectable, Logger } from '@nestjs/common';
import { EvolutionWebhookDto } from './dto/evolution-webhook.dto';
import { WebhookQueryDto } from './dto/webhook-query.dto';
import { WebhooksRepository } from './webhooks.repository';
import { normalizeEvolutionWebhook } from './utils/webhook-normalizer.util';
import { InboundMessagesHandler } from './handlers/inbound-message.handler';
import { DeliveryStatusHandler } from './handlers/delivery-status.handler';
import { ConversationEventsHandler } from './handlers/conversation-event.handler';
import { NormalizedWebhookDto } from './dto/normalized-webhook.dto';
import { N8nService } from '../../integrations/n8n/n8n.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly webhooksRepository: WebhooksRepository,
    private readonly inboundMessagesHandler: InboundMessagesHandler,
    private readonly deliveryStatusHandler: DeliveryStatusHandler,
    private readonly conversationEventsHandler: ConversationEventsHandler,
    private readonly n8nService: N8nService,
  ) {}

  async receiveEvolutionWebhook(
    payload: EvolutionWebhookDto | Record<string, unknown>,
  ): Promise<{
    success: boolean;
    message: string;
    eventType: string;
    normalized: {
      instanceName: string | null;
      contactPhone: string | null;
      contactName: string | null;
      messageText: string | null;
      messageType: string | null;
      deliveryStatus: string | null;
      eventAt: Date;
      conversationExternalId: string | null;
      externalMessageId: string | null;
      messageId: string | null;
    };
  }> {
    const normalized: NormalizedWebhookDto = normalizeEvolutionWebhook(payload);
    const webhookLog = await this.webhooksRepository.createWebhookLog(normalized);

    try {
      await this.dispatch(normalized);
      await this.webhooksRepository.markProcessed(webhookLog.id);
      await this.n8nService.notifyWebhookProcessed({
        webhookEventId: webhookLog.id,
        normalized,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected webhook processing error';
      await this.webhooksRepository.markFailed(webhookLog.id, message);
      throw error;
    }

    return {
      success: true,
      message: 'Webhook processed successfully',
      eventType: normalized.eventType,
      normalized: {
        instanceName: normalized.instanceName,
        contactPhone: normalized.contactPhone,
        contactName: normalized.contactName,
        messageText: normalized.messageText,
        messageType: normalized.messageType,
        deliveryStatus: normalized.deliveryStatus,
        eventAt: normalized.eventAt,
        conversationExternalId: normalized.conversationExternalId,
        externalMessageId: normalized.externalMessageId,
        messageId: normalized.externalMessageId,
      },
    };
  }

  async findAll(query: WebhookQueryDto) {
    return this.webhooksRepository.findMany(query);
  }

  private async dispatch(payload: NormalizedWebhookDto): Promise<void> {
    switch (payload.eventType) {
      case 'inbound_message':
        await this.inboundMessagesHandler.handle(payload);
        return;

      case 'delivery_status':
        await this.deliveryStatusHandler.handle(payload);
        return;

      case 'conversation_event':
        await this.conversationEventsHandler.handle(payload);
        return;

      default:
        this.logger.warn(`Unhandled webhook event type: ${payload.eventType}`);
        return;
    }
  }
}
