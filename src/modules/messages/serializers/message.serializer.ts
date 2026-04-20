import { MessageEntity } from '../entities/message.entity';

export class MessageSerializer {
  static serialize(message: MessageEntity) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderType: message.senderType,
      senderId: message.senderId ?? null,
      content: message.content,
      type: message.type,
      templateName: message.templateName ?? null,
      status: message.status,
      isFromCustomer: message.isFromCustomer,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  static serializeMany(messages: MessageEntity[]) {
    return messages.map((message) => this.serialize(message));
  }
}
