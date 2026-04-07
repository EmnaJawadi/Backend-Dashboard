import { EvolutionWebhookDto } from '../dto/evolution-webhook.dto';
import {
  NormalizedWebhookDto,
  NormalizedWebhookEventType,
} from '../dto/normalized-webhook.dto';

function pickMessageText(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.body,
    payload.text,
    payload.message,
    payload.content,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

function pickString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function detectEventType(event?: string): NormalizedWebhookEventType {
  const value = (event ?? '').toLowerCase();

  if (
    value.includes('message.upsert') ||
    value.includes('messages.upsert') ||
    value.includes('message_received') ||
    value.includes('inbound')
  ) {
    return 'inbound_message';
  }

  if (
    value.includes('status') ||
    value.includes('delivery') ||
    value.includes('ack')
  ) {
    return 'delivery_status';
  }

  if (
    value.includes('conversation') ||
    value.includes('chat') ||
    value.includes('thread')
  ) {
    return 'conversation_event';
  }

  return 'unknown';
}

export function normalizeEvolutionWebhook(
  payload: EvolutionWebhookDto | Record<string, unknown>,
): NormalizedWebhookDto {
  const raw = payload as Record<string, unknown>;
  const data =
    raw.data && typeof raw.data === 'object'
      ? (raw.data as Record<string, unknown>)
      : {};

  const firstMessage =
    Array.isArray(raw.messages) && raw.messages.length > 0
      ? (raw.messages[0] as Record<string, unknown>)
      : {};

  const event = typeof raw.event === 'string' ? raw.event : undefined;
  const eventType = detectEventType(event);

  const externalMessageId =
    pickString(firstMessage, ['key', 'id', 'messageId']) ??
    pickString(data, ['key', 'id', 'messageId']) ??
    null;

  const conversationExternalId =
    pickString(data, ['conversationId', 'chatId', 'remoteJid']) ??
    pickString(firstMessage, ['remoteJid', 'chatId']) ??
    null;

  const contactPhone =
    pickString(data, ['sender', 'from', 'phone', 'remoteJid']) ??
    pickString(firstMessage, ['from', 'sender']) ??
    (typeof raw.sender === 'string' ? raw.sender : null);

  const contactName =
    pickString(data, ['pushName', 'name', 'senderName']) ??
    (typeof raw.pushName === 'string' ? raw.pushName : null);

  const messageText =
    pickMessageText(firstMessage) ??
    pickMessageText(data) ??
    null;

  const messageType =
    pickString(firstMessage, ['type']) ??
    pickString(data, ['type', 'messageType']) ??
    'text';

  const deliveryStatus =
    pickString(data, ['status', 'ack', 'deliveryStatus']) ??
    pickString(firstMessage, ['status']) ??
    null;

  const direction: 'inbound' | 'outbound' | 'system' | null =
    eventType === 'inbound_message'
      ? 'inbound'
      : eventType === 'delivery_status'
        ? 'outbound'
        : eventType === 'conversation_event'
          ? 'system'
          : null;

  const timestampValue =
    pickString(firstMessage, ['timestamp']) ??
    pickString(data, ['timestamp', 'eventAt', 'createdAt']);

  const parsedDate =
    timestampValue && !Number.isNaN(Date.parse(timestampValue))
      ? new Date(timestampValue)
      : new Date();

  return new NormalizedWebhookDto({
    eventType,
    provider: 'evolution',
    externalMessageId,
    conversationExternalId,
    contactPhone,
    contactName,
    messageText,
    messageType,
    deliveryStatus,
    direction,
    eventAt: parsedDate,
    rawPayload: raw,
  });
}