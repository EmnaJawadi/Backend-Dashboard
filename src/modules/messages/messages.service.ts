import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { ConversationsService } from '../conversations/conversations.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { SaveMessageDto } from './dto/save-message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageStatusDto } from './dto/update-message-status.dto';
import { MessageSenderType, MessageType } from './entities/message.entity';
import { MessagesRepository } from './messages.repository';
import { MessageSerializer } from './serializers/message.serializer';

@Injectable()
export class MessagesService {
  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
  ) {}

  private parseEventDate(value?: string | number | null): Date {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const asMs = value > 1_000_000_000_000 ? value : value * 1000;
      return new Date(asMs);
    }

    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim();
      const numeric = Number(trimmed);

      if (Number.isFinite(numeric)) {
        const asMs = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
        return new Date(asMs);
      }

      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed);
      }
    }

    return new Date();
  }

  private normalizeDirectionStatus(
    status: string | undefined,
    direction: 'inbound' | 'outbound',
  ) {
    const normalized = status?.trim().toLowerCase();

    if (!normalized) {
      return direction === 'inbound' ? 'delivered' : 'sent';
    }

    if (normalized === 'received') {
      return 'delivered';
    }

    if (normalized === 'queued' || normalized === 'pending') {
      return 'sent';
    }

    if (
      normalized === 'sent' ||
      normalized === 'delivered' ||
      normalized === 'read' ||
      normalized === 'failed'
    ) {
      return normalized;
    }

    return direction === 'inbound' ? 'delivered' : 'sent';
  }

  private resolveSenderType(
    direction: 'inbound' | 'outbound',
    senderType?: MessageSenderType,
  ): MessageSenderType {
    if (direction === 'inbound') {
      return 'customer';
    }

    return senderType ?? 'bot';
  }

  private resolveMessageType(type?: MessageType): MessageType {
    return type ?? 'text';
  }

  private async resolveConversationId(saveMessageDto: SaveMessageDto) {
    const providedConversationId = saveMessageDto.conversationId?.trim();

    if (providedConversationId && providedConversationId.toLowerCase() !== 'null') {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: providedConversationId },
        select: { id: true, companyId: true },
      });

      if (!conversation) {
        throw new BadRequestException({
          code: 'CONVERSATION_NOT_FOUND',
          message: `Conversation ${providedConversationId} not found`,
        });
      }

      return {
        conversationId: conversation.id,
        companyId: conversation.companyId ?? null,
      };
    }

    if (!saveMessageDto.phoneNumber?.trim()) {
      throw new BadRequestException({
        code: 'CONVERSATION_OR_PHONE_REQUIRED',
        message:
          'Provide conversationId, or phoneNumber/contactName so backend can create the conversation.',
      });
    }

    const workflowConversation =
      await this.conversationsService.getOrCreateForWhatsapp({
        phoneNumber: saveMessageDto.phoneNumber,
        contactName: saveMessageDto.contactName,
        messageText: saveMessageDto.content,
        messageId: saveMessageDto.messageId,
        eventAt: saveMessageDto.eventAt,
        companyId: saveMessageDto.companyId,
      });

    return {
      conversationId: workflowConversation.conversationId,
      companyId: workflowConversation.companyId ?? saveMessageDto.companyId ?? null,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  async create(createMessageDto: CreateMessageDto) {
    const message = await this.messagesRepository.create({
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

  async save(saveMessageDto: SaveMessageDto) {
    const content = saveMessageDto.content?.trim() ?? '';

    if (!content) {
      return {
        saved: false,
        ignored: true,
        duplicate: false,
        reason: 'EMPTY_CONTENT',
        conversationId: saveMessageDto.conversationId ?? null,
        messageId: null,
      };
    }

    const externalMessageId = saveMessageDto.messageId?.trim() ?? null;
    const occurredAt = this.parseEventDate(saveMessageDto.eventAt);

    if (externalMessageId) {
      const existingByExternalId = await this.prisma.message.findFirst({
        where: { externalMessageId },
        orderBy: { createdAt: 'desc' },
      });

      if (existingByExternalId) {
        return {
          saved: false,
          ignored: true,
          duplicate: true,
          reason: 'DUPLICATE_EXTERNAL_MESSAGE_ID',
          conversationId: existingByExternalId.conversationId,
          messageId: existingByExternalId.id,
          externalMessageId,
        };
      }
    }

    const resolved = await this.resolveConversationId(saveMessageDto);
    const conversationId = resolved.conversationId;
    const direction = saveMessageDto.direction;

    if (!direction) {
      throw new BadRequestException({
        code: 'DIRECTION_REQUIRED',
        message: 'direction must be inbound or outbound',
      });
    }
    const signatureWindowStart = new Date(occurredAt.getTime() - 90 * 1000);

    const nearDuplicate = externalMessageId
      ? null
      : await this.prisma.message.findFirst({
          where: {
            conversationId,
            direction,
            content,
            createdAt: { gte: signatureWindowStart },
          },
          orderBy: { createdAt: 'desc' },
        });

    if (nearDuplicate) {
      return {
        saved: false,
        ignored: true,
        duplicate: true,
        reason: 'DUPLICATE_MESSAGE_SIGNATURE',
        conversationId: nearDuplicate.conversationId,
        messageId: nearDuplicate.id,
        externalMessageId: nearDuplicate.externalMessageId ?? null,
      };
    }

    const senderType = this.resolveSenderType(direction, saveMessageDto.senderType);
    const status = this.normalizeDirectionStatus(saveMessageDto.status, direction);

    const saved = await this.messagesRepository.create({
      conversationId,
      companyId: saveMessageDto.companyId ?? resolved.companyId ?? null,
      externalMessageId,
      senderType,
      content,
      type: this.resolveMessageType(saveMessageDto.type),
      status,
      isFromCustomer: direction === 'inbound',
      rawPayload: saveMessageDto.rawPayload
        ? this.toJson(saveMessageDto.rawPayload)
        : undefined,
      occurredAt,
    });

    return {
      saved: true,
      ignored: false,
      duplicate: false,
      reason: null,
      ...MessageSerializer.serialize(saved),
      direction,
      externalMessageId,
    };
  }

  async receiveInboundMessage(inboundMessageDto: InboundMessageDto) {
    const message = await this.messagesRepository.create({
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

  async sendMessage(sendMessageDto: SendMessageDto) {
    const message = await this.messagesRepository.create({
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

  async findAll(query: MessageQueryDto) {
    const result = await this.messagesRepository.findAll(query);

    return {
      data: MessageSerializer.serializeMany(result.data),
      meta: result.meta,
    };
  }

  async findOne(id: string) {
    const message = await this.messagesRepository.findById(id);
    return MessageSerializer.serialize(message);
  }

  async updateStatus(id: string, updateMessageStatusDto: UpdateMessageStatusDto) {
    const message = await this.messagesRepository.updateStatus(
      id,
      updateMessageStatusDto.status,
    );

    return MessageSerializer.serialize(message);
  }

  async remove(id: string) {
    const message = await this.messagesRepository.remove(id);
    return MessageSerializer.serialize(message);
  }

  async saveIncoming(payload: SaveMessageDto) {
    return this.save({
      ...payload,
      direction: 'inbound',
      senderType: 'customer',
    });
  }

  async saveBot(payload: SaveMessageDto) {
    return this.save({
      ...payload,
      direction: 'outbound',
      senderType: 'bot',
    });
  }

  async saveHuman(payload: SaveMessageDto) {
    return this.save({
      ...payload,
      direction: 'outbound',
      senderType: 'agent',
    });
  }
}
