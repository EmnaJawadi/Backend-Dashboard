import {
  MessageSenderType,
  MessageStatus,
  MessageType,
} from '../entities/message.entity';

export class CreateMessageDto {
  conversationId!: string;
  senderType!: MessageSenderType;
  senderId?: string | null;
  content!: string;
  type?: MessageType;
  status?: MessageStatus;
  isFromCustomer?: boolean;
}