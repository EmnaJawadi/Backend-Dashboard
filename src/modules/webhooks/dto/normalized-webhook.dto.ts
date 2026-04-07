export type NormalizedWebhookEventType =
  | 'inbound_message'
  | 'delivery_status'
  | 'conversation_event'
  | 'unknown';

export class NormalizedWebhookDto {
  eventType!: NormalizedWebhookEventType;
  provider!: string;
  externalMessageId!: string | null;
  conversationExternalId!: string | null;
  contactPhone!: string | null;
  contactName!: string | null;
  messageText!: string | null;
  messageType!: string | null;
  deliveryStatus!: string | null;
  direction!: 'inbound' | 'outbound' | 'system' | null;
  eventAt!: Date;
  rawPayload!: Record<string, unknown>;

  constructor(partial: Partial<NormalizedWebhookDto>) {
    Object.assign(this, partial);
  }
}