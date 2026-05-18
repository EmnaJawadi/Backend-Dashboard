export type NormalizedWebhookEventType =
  | 'inbound_message'
  | 'delivery_status'
  | 'conversation_event'
  | 'unknown';

export class NormalizedWebhookDto {
  eventType!: NormalizedWebhookEventType;
  provider!: string;
  instanceName!: string | null;
  externalMessageId!: string | null;
  conversationExternalId!: string | null;
  contactPhone!: string | null;
  contactName!: string | null;
  messageText!: string | null;
  messageType!: string | null;
  caption!: string | null;
  mediaUrl!: string | null;
  mediaId!: string | null;
  mimeType!: string | null;
  deliveryStatus!: string | null;
  direction!: 'inbound' | 'outbound' | 'system' | null;
  eventAt!: Date;
  rawPayload!: Record<string, unknown>;

  constructor(partial: Partial<NormalizedWebhookDto>) {
    Object.assign(this, partial);
  }
}
