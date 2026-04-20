import { MessageType } from '../entities/message.entity';

export class SendMessageDto {
  conversationId!: string;
  content!: string;
  type?: MessageType;
  templateName?: string | null;
  senderId?: string | null;
}
