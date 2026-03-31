import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MessageQueryDto } from './dto/message-query.dto';
import { MessageEntity } from './entities/message.entity';
import { MessageMapper } from './mappers/message.mapper';

@Injectable()
export class MessagesRepository {
  private readonly messages: MessageEntity[] = [];

  create(data: Partial<MessageEntity>): MessageEntity {
    const now = new Date();

    const message = MessageMapper.toEntity({
      id: randomUUID(),
      conversationId: data.conversationId,
      senderType: data.senderType,
      senderId: data.senderId ?? null,
      content: data.content,
      type: data.type ?? 'text',
      status: data.status ?? 'sent',
      isFromCustomer: data.isFromCustomer ?? false,
      createdAt: now,
      updatedAt: now,
    });

    this.messages.push(message);
    return message;
  }

  findAll(query: MessageQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    let data = [...this.messages];

    if (query.conversationId) {
      data = data.filter(
        (message) => message.conversationId === query.conversationId,
      );
    }

    if (query.senderType) {
      data = data.filter((message) => message.senderType === query.senderType);
    }

    if (query.type) {
      data = data.filter((message) => message.type === query.type);
    }

    if (query.status) {
      data = data.filter((message) => message.status === query.status);
    }

    data.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const total = data.length;
    const start = (page - 1) * limit;
    const paginated = data.slice(start, start + limit);

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  findById(id: string): MessageEntity {
    const message = this.messages.find((item) => item.id === id);

    if (!message) {
      throw new NotFoundException(`Message with id ${id} not found`);
    }

    return message;
  }

  updateStatus(id: string, status: MessageEntity['status']): MessageEntity {
    const message = this.findById(id);
    message.status = status;
    message.updatedAt = new Date();

    return message;
  }

  remove(id: string): MessageEntity {
    const index = this.messages.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`Message with id ${id} not found`);
    }

    const deleted = this.messages[index];
    this.messages.splice(index, 1);

    return deleted;
  }
}