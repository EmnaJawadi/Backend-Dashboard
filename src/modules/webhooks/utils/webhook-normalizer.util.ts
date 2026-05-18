import { EvolutionWebhookDto } from '../dto/evolution-webhook.dto';
import {
  NormalizedWebhookDto,
  NormalizedWebhookEventType,
} from '../dto/normalized-webhook.dto';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

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

function extractNestedMessageText(payload: Record<string, unknown>): string | null {
  const message = asRecord(payload.message);

  const directCandidates = [
    message.conversation,
    asRecord(message.extendedTextMessage).text,
    asRecord(message.imageMessage).caption,
    asRecord(message.videoMessage).caption,
    asRecord(message.documentMessage).caption,
    asRecord(message.templateButtonReplyMessage).selectedDisplayText,
    asRecord(message.buttonsResponseMessage).selectedDisplayText,
    asRecord(message.listResponseMessage).title,
    asRecord(message.listResponseMessage).description,
  ];

  for (const candidate of directCandidates) {
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

function pickValue(payload: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in payload) {
      return payload[key];
    }
  }

  return null;
}

function pickBoolean(payload: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === 'boolean') {
      return value;
    }
  }

  return null;
}

function parseEventDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const asMs = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(asMs);
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      const asMs = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
      return new Date(asMs);
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  return new Date();
}

function normalizeMessageType(rawType: unknown): string {
  const value = typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';

  if (!value) {
    return 'text';
  }

  if (
    value === 'conversation' ||
    value === 'text' ||
    value === 'extendedtextmessage' ||
    value === 'protocolmessage'
  ) {
    return 'text';
  }

  if (value === 'imagemessage' || value === 'image') {
    return 'image';
  }

  if (value === 'audiomessage' || value === 'audio') {
    return 'audio';
  }

  if (value === 'videomessage' || value === 'video') {
    return 'video';
  }

  if (value === 'documentmessage' || value === 'document') {
    return 'document';
  }

  if (
    value === 'template' ||
    value === 'templatemessage' ||
    value === 'templatebuttonreplymessage' ||
    value === 'buttonsresponsemessage' ||
    value === 'listresponsemessage'
  ) {
    return 'text';
  }

  if (value === 'system' || value === 'notification') {
    return 'system';
  }

  return 'text';
}

function normalizeDeliveryStatus(rawStatus: unknown): string | null {
  if (typeof rawStatus === 'number' && Number.isFinite(rawStatus)) {
    switch (rawStatus) {
      case 0:
        return 'queued';
      case 1:
        return 'sent';
      case 2:
        return 'delivered';
      case 3:
      case 4:
        return 'read';
      case 5:
        return 'failed';
      default:
        return null;
    }
  }

  if (typeof rawStatus !== 'string' || !rawStatus.trim()) {
    return null;
  }

  const value = rawStatus.trim().toLowerCase();
  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return normalizeDeliveryStatus(numeric);
  }

  if (value === 'received') {
    return 'received';
  }

  if (value.includes('queue') || value === 'pending') {
    return 'queued';
  }

  if (value.includes('sent') || value.includes('server') || value === 'ack') {
    return 'sent';
  }

  if (value.includes('deliver')) {
    return 'delivered';
  }

  if (value.includes('read') || value.includes('seen') || value.includes('play')) {
    return 'read';
  }

  if (value.includes('fail') || value.includes('error')) {
    return 'failed';
  }

  return null;
}

function detectEventType(event?: string): NormalizedWebhookEventType {
  const value = (event ?? '').toLowerCase();

  if (
    value.includes('message.upsert') ||
    value.includes('messages.upsert') ||
    value.includes('message_upsert') ||
    value.includes('messages_upsert') ||
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
  const data = asRecord(raw.data);

  const firstMessage =
    Array.isArray(raw.messages) && raw.messages.length > 0
      ? asRecord(raw.messages[0])
      : {};
  const dataKey = asRecord(data.key);
  const firstMessageKey = asRecord(firstMessage.key);

  const event = typeof raw.event === 'string' ? raw.event : undefined;
  const rawEventType = detectEventType(event);
  const instanceName =
    pickString(raw, ['instance']) ??
    pickString(data, ['instance']) ??
    pickString(asRecord(data.instanceData), ['instanceName', 'instance']) ??
    null;

  const externalMessageId =
    pickString(firstMessage, ['key', 'id', 'messageId']) ??
    pickString(firstMessageKey, ['id']) ??
    pickString(dataKey, ['id']) ??
    pickString(data, ['key', 'id', 'messageId']) ??
    null;

  const conversationExternalId =
    pickString(data, ['conversationId', 'chatId', 'remoteJid']) ??
    pickString(dataKey, ['remoteJid']) ??
    pickString(firstMessageKey, ['remoteJid']) ??
    pickString(firstMessage, ['remoteJid', 'chatId']) ??
    null;

  const contactPhone =
    pickString(data, ['sender', 'from', 'phone', 'remoteJid']) ??
    pickString(dataKey, ['participant', 'remoteJid']) ??
    pickString(firstMessageKey, ['participant', 'remoteJid']) ??
    pickString(firstMessage, ['from', 'sender']) ??
    (typeof raw.sender === 'string' ? raw.sender : null);

  const contactName =
    pickString(data, ['pushName', 'name', 'senderName']) ??
    (typeof raw.pushName === 'string' ? raw.pushName : null);
  const firstMessagePayload = asRecord(firstMessage.message);
  const dataMessage = asRecord(data.message);
  const firstImageMessage = asRecord(firstMessagePayload.imageMessage);
  const dataImageMessage = asRecord(dataMessage.imageMessage);

  const messageText =
    pickMessageText(firstMessage) ??
    extractNestedMessageText(firstMessage) ??
    pickMessageText(data) ??
    extractNestedMessageText(data) ??
    null;

  const rawMessageType =
    pickString(firstMessage, ['type', 'messageType']) ??
    pickString(data, ['type', 'messageType']) ??
    (Object.keys(firstMessagePayload)[0] ?? null) ??
    (Object.keys(dataMessage)[0] ?? null) ??
    'text';
  const messageType = normalizeMessageType(rawMessageType);
  const caption =
    messageType === 'image'
      ? pickString(firstImageMessage, ['caption']) ??
        pickString(dataImageMessage, ['caption']) ??
        messageText
      : null;
  const mediaUrl =
    messageType === 'image'
      ? pickString(data, ['mediaUrl', 'media_url', 'url']) ??
        pickString(firstMessage, ['mediaUrl', 'media_url', 'url']) ??
        pickString(firstImageMessage, ['url', 'media', 'directPath']) ??
        pickString(dataImageMessage, ['url', 'media', 'directPath'])
      : null;
  const mediaId =
    messageType === 'image'
      ? pickString(data, ['mediaId', 'media_id']) ??
        pickString(firstMessage, ['mediaId', 'media_id']) ??
        pickString(firstImageMessage, ['mediaKey', 'fileSha256']) ??
        pickString(dataImageMessage, ['mediaKey', 'fileSha256'])
      : null;
  const mimeType =
    messageType === 'image'
      ? pickString(firstImageMessage, ['mimetype', 'mimeType']) ??
        pickString(dataImageMessage, ['mimetype', 'mimeType']) ??
        pickString(data, ['mimetype', 'mimeType']) ??
        'image/jpeg'
      : null;

  const rawDeliveryStatus =
    pickValue(data, ['status', 'ack', 'deliveryStatus']) ??
    pickValue(firstMessage, ['ack', 'deliveryStatus', 'status']) ??
    null;
  const deliveryStatus = normalizeDeliveryStatus(rawDeliveryStatus);

  const fromMe =
    pickBoolean(firstMessageKey, ['fromMe']) ??
    pickBoolean(dataKey, ['fromMe']) ??
    pickBoolean(firstMessage, ['fromMe']) ??
    pickBoolean(data, ['fromMe']) ??
    false;

  const eventType: NormalizedWebhookEventType =
    rawEventType === 'inbound_message' && fromMe ? 'delivery_status' : rawEventType;

  const direction: 'inbound' | 'outbound' | 'system' | null =
    eventType === 'inbound_message'
      ? 'inbound'
      : eventType === 'delivery_status'
        ? 'outbound'
        : eventType === 'conversation_event'
          ? 'system'
          : null;

  const timestampValue =
    pickValue(firstMessage, ['timestamp', 'messageTimestamp']) ??
    pickValue(data, ['messageTimestamp', 'timestamp', 'eventAt', 'createdAt']) ??
    pickValue(raw, ['timestamp', 'eventAt', 'createdAt']);
  const parsedDate = parseEventDate(timestampValue);

  return new NormalizedWebhookDto({
    eventType,
    provider: 'evolution',
    instanceName,
    externalMessageId,
    conversationExternalId,
    contactPhone,
    contactName,
    messageText,
    messageType,
    caption,
    mediaUrl,
    mediaId,
    mimeType,
    deliveryStatus,
    direction,
    eventAt: parsedDate,
    rawPayload: raw,
  });
}
