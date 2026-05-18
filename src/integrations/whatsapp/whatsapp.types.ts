export type WhatsappSendTextMessageInput = {
  to: string;
  text: string;
  instanceName?: string;
  apiBaseUrl?: string | null;
  apiKey?: string | null;
};

export type WhatsappSendMediaMessageInput = {
  to: string;
  mediaUrl: string;
  fileName?: string;
  caption?: string;
  instanceName?: string;
  apiBaseUrl?: string | null;
  apiKey?: string | null;
};

export type WhatsappSendMessageResult = {
  success: boolean;
  provider: string;
  messageId: string | null;
  raw: Record<string, unknown> | null;
};

export type WhatsappProviderName = 'evolution';
