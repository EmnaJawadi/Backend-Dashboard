import { Injectable } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageStatusDto } from './dto/update-message-status.dto';
import { MessagesRepository } from './messages.repository';
import { MessageSerializer } from './serializers/message.serializer';

@Injectable()
export class MessagesService {
  constructor(private readonly messagesRepository: MessagesRepository) {}

  create(createMessageDto: CreateMessageDto) {
    const message = this.messagesRepository.create({
      conversationId: createMessageDto.conversationId,
      senderType: createMessageDto.senderType,
      senderId: createMessageDto.senderId ?? null,
      content: createMessageDto.content,
      type: createMessageDto.type ?? 'text',
      status: createMessageDto.status ?? 'sent',
      isFromCustomer: createMessageDto.isFromCustomer ?? false,
    });

    return MessageSerializer.serialize(message);
  }

  receiveInboundMessage(inboundMessageDto: InboundMessageDto) {
    const message = this.messagesRepository.create({
      conversationId: inboundMessageDto.conversationId,
      senderType: 'customer',
      senderId: null,
      content: inboundMessageDto.content,
      type: inboundMessageDto.type ?? 'text',
      status: 'delivered',
      isFromCustomer: true,
    });

    return MessageSerializer.serialize(message);
  }

  sendMessage(sendMessageDto: SendMessageDto) {
    const message = this.messagesRepository.create({
      conversationId: sendMessageDto.conversationId,
      senderType: 'agent',
      senderId: sendMessageDto.senderId ?? null,
      content: sendMessageDto.content,
      type: sendMessageDto.type ?? 'text',
      status: 'sent',
      isFromCustomer: false,
    });

    return MessageSerializer.serialize(message);
  }

  findAll(query: MessageQueryDto) {
    const result = this.messagesRepository.findAll(query);

    return {
      data: MessageSerializer.serializeMany(result.data),
      meta: result.meta,
    };
  }

  findOne(id: string) {
    const message = this.messagesRepository.findById(id);
    return MessageSerializer.serialize(message);
  }

  updateStatus(id: string, updateMessageStatusDto: UpdateMessageStatusDto) {
    const message = this.messagesRepository.updateStatus(
      id,
      updateMessageStatusDto.status,
    );

    return MessageSerializer.serialize(message);
  }

  remove(id: string) {
    const message = this.messagesRepository.remove(id);
    return MessageSerializer.serialize(message);
  }
}