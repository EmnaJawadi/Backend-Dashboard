import { Injectable, Logger } from '@nestjs/common';
import { EvolutionWebhookDto } from './dto/evolution-webhook.dto';
import { WebhookQueryDto } from './dto/webhook-query.dto';
import { WebhooksRepository } from './webhooks.repository';
import { normalizeEvolutionWebhook } from './utils/webhook-normalizer.util';
import { InboundMessagesHandler } from './handlers/inbound-message.handler';
import { DeliveryStatusHandler } from './handlers/delivery-status.handler';
import { ConversationEventsHandler } from './handlers/conversation-event.handler';
import { NormalizedWebhookDto } from './dto/normalized-webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly webhooksRepository: WebhooksRepository,
    private readonly inboundMessagesHandler: InboundMessagesHandler,
    private readonly deliveryStatusHandler: DeliveryStatusHandler,
    private readonly conversationEventsHandler: ConversationEventsHandler,
  ) {}

  async receiveEvolutionWebhook(
    payload: EvolutionWebhookDto | Record<string, unknown>,
  ): Promise<{
    success: boolean;
    message: string;
    eventType: string;
  }> {
    const normalized: NormalizedWebhookDto = normalizeEvolutionWebhook(payload);

    await this.webhooksRepository.createWebhookLog(normalized);
    await this.dispatch(normalized);

    return {
      success: true,
      message: 'Webhook processed successfully',
      eventType: normalized.eventType,
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