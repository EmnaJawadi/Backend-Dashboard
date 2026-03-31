import {
  MessageSenderType,
  MessageStatus,
  MessageType,
} from '../entities/message.entity';

export class MessageQueryDto {
  conversationId?: string;
  senderType?: MessageSenderType;
  type?: MessageType;
  status?: MessageStatus;
  page?: number;
  limit?: number;
}