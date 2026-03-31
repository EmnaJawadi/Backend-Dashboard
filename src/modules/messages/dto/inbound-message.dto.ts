import { MessageType } from '../entities/message.entity';

export class InboundMessageDto {
  conversationId!: string;
  customerPhone?: string;
  customerName?: string;
  content!: string;
  type?: MessageType;
}