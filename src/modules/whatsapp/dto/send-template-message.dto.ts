export class SendTemplateMessageDto {
  phoneNumber!: string;
  templateName!: string;
  language?: string;
  variables?: Record<string, string>;
  conversationId?: string;
}