import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContactEntity } from '../../modules/contacts/entities/contact.entity';
import { NormalizedWebhookDto } from '../../modules/webhooks/dto/normalized-webhook.dto';

type N8nEventPayload = Record<string, unknown>;

@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl = (
      this.configService.get<string>('N8N_WEBHOOK_URL') ?? ''
    ).trim();
    this.webhookSecret = (
      this.configService.get<string>('N8N_WEBHOOK_SECRET') ?? ''
    ).trim();
    this.timeoutMs =
      this.configService.get<number>('N8N_WEBHOOK_TIMEOUT_MS') ?? 8000;
  }

  async notifyContactDeleted(contact: ContactEntity): Promise<void> {
    await this.dispatch('contact.deleted', {
      contact: {
        id: contact.id,
        fullName: contact.fullName,
        firstName: contact.firstName,
        lastName: contact.lastName ?? null,
        phoneNumber: contact.phoneNumber,
        email: contact.email ?? null,
        tags: contact.tags ?? [],
      },
    });
  }

  async notifyWebhookProcessed(params: {
    webhookEventId: string;
    normalized: NormalizedWebhookDto;
  }): Promise<void> {
    await this.dispatch('webhook.evolution.processed', {
      webhookEventId: params.webhookEventId,
      provider: params.normalized.provider,
      eventType: params.normalized.eventType,
      externalMessageId: params.normalized.externalMessageId,
      conversationExternalId: params.normalized.conversationExternalId,
      contactPhone: params.normalized.contactPhone,
      contactName: params.normalized.contactName,
      messageText: params.normalized.messageText,
      messageType: params.normalized.messageType,
      deliveryStatus: params.normalized.deliveryStatus,
      direction: params.normalized.direction,
      eventAt: params.normalized.eventAt,
    });
  }

  private async dispatch(event: string, payload: N8nEventPayload): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.webhookSecret
            ? {
                'x-n8n-secret': this.webhookSecret,
              }
            : {}),
        },
        body: JSON.stringify({
          source: 'backend-support-whatsapp',
          event,
          occurredAt: new Date().toISOString(),
          payload,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = await response.text();
        this.logger.warn(
          `n8n webhook responded with status ${response.status}: ${details}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to send event "${event}" to n8n: ${(error as Error).message}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

