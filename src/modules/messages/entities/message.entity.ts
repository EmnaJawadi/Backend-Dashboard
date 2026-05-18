export type MessageSenderType =
  | 'customer'
  | 'human'
  | 'human_agent'
  | 'agent'
  | 'bot'
  | 'system';
export type MessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'document'
  | 'video'
  | 'button'
  | 'list'
  | 'unknown';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export class MessageEntity {
  id!: string;
  conversationId!: string;
  senderType!: MessageSenderType;
  senderId?: string | null;
  content!: string;
  type!: MessageType;
  status!: MessageStatus;
  isFromCustomer!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<MessageEntity>) {
    Object.assign(this, partial);
  }
}
