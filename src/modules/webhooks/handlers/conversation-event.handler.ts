import { Injectable, Logger } from '@nestjs/common';
import { NormalizedWebhookDto } from '../dto/normalized-webhook.dto';

@Injectable()
export class ConversationEventsHandler {
  private readonly logger = new Logger(ConversationEventsHandler.name);

  async handle(payload: NormalizedWebhookDto): Promise<void> {
    this.logger.log(
      `Conversation event received: conversation=${payload.conversationExternalId ?? 'n/a'}`,
    );
  }
}