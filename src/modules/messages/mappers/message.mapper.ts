import { MessageEntity } from '../entities/message.entity';

export class MessageMapper {
  static toEntity(data: Partial<MessageEntity>): MessageEntity {
    return new MessageEntity(data);
  }
}