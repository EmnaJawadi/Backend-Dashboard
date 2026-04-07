import { Injectable, Logger } from '@nestjs/common';
import { NormalizedWebhookDto } from '../dto/normalized-webhook.dto';

@Injectable()
export class InboundMessagesHandler {
  private readonly logger = new Logger(InboundMessagesHandler.name);

  async handle(payload: NormalizedWebhookDto): Promise<void> {
    this.logger.log(
      `Inbound message received from ${payload.contactPhone ?? 'unknown'}: ${payload.messageText ?? ''}`,
    );
  }
}