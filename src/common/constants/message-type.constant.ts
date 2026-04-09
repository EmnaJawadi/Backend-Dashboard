export const MESSAGE_TYPE = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  AUDIO: 'AUDIO',
  VIDEO: 'VIDEO',
  DOCUMENT: 'DOCUMENT',
  LOCATION: 'LOCATION',
  CONTACT: 'CONTACT',
  STICKER: 'STICKER',
  TEMPLATE: 'TEMPLATE',
  INTERACTIVE: 'INTERACTIVE',
  SYSTEM: 'SYSTEM',
} as const;

export type MessageType =
  (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

export const MESSAGE_TYPE_VALUES: MessageType[] = Object.values(MESSAGE_TYPE);