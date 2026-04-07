import { Injectable, Logger } from '@nestjs/common';
import { NormalizedWebhookDto } from '../dto/normalized-webhook.dto';

@Injectable()
export class DeliveryStatusHandler {
  private readonly logger = new Logger(DeliveryStatusHandler.name);

  async handle(payload: NormalizedWebhookDto): Promise<void> {
    this.logger.log(
      `Delivery status updated: message=${payload.externalMessageId ?? 'n/a'} status=${payload.deliveryStatus ?? 'unknown'}`,
    );
  }
}