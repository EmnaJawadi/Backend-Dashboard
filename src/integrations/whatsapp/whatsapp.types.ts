export type WhatsappSendTextMessageInput = {
  to: string;
  text: string;
};

export type WhatsappSendTemplateMessageInput = {
  to: string;
  templateName: string;
  language?: string;
  parameters?: string[];
  variables?: Record<string, string>;
};

export type WhatsappSendMediaMessageInput = {
  to: string;
  mediaUrl: string;
  fileName?: string;
  caption?: string;
};

export type WhatsappSendMessageResult = {
  success: boolean;
  provider: string;
  messageId: string | null;
  raw: Record<string, unknown> | null;
};

export type WhatsappProviderName = 'evolution';
