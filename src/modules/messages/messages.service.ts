import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { ConversationsService } from '../conversations/conversations.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
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
    private readonly whatsappService: WhatsappService,
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

    const normalized = senderType ?? 'bot';
    return normalized === 'agent' || normalized === 'human'
      ? 'human_agent'
      : normalized;
  }

  private resolveMessageType(type?: MessageType): MessageType {
    return type ?? 'text';
  }

  private isTextLikeMessage(type?: MessageType): boolean {
    return (
      !type ||
      type === 'text' ||
      type === 'button' ||
      type === 'list' ||
      type === 'unknown'
    );
  }

  private async resolveConversationId(saveMessageDto: SaveMessageDto) {
    const providedConversationId = saveMessageDto.conversationId?.trim();

    if (providedConversationId && providedConversationId.toLowerCase() !== 'null') {
      const resolvedCompanyId = await this.resolveWorkflowCompanyId(saveMessageDto);
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          id: providedConversationId,
          ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}),
        },
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
        instance: saveMessageDto.instance ?? saveMessageDto.instanceName,
        rawRemoteJid: saveMessageDto.rawRemoteJid,
      });

    return {
      conversationId: workflowConversation.conversationId,
      companyId: workflowConversation.companyId ?? saveMessageDto.companyId ?? null,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private async resolveWorkflowCompanyId(saveMessageDto: SaveMessageDto) {
    const instanceName = (
      saveMessageDto.instanceName ??
      saveMessageDto.instance ??
      ''
    ).trim();

    if (instanceName) {
      const instance = await this.prisma.companyWhatsappInstance.findUnique({
        where: { evolutionInstanceName: instanceName },
        select: { companyId: true },
      });

      if (instance?.companyId) {
        return instance.companyId;
      }
    }

    const companyId = saveMessageDto.companyId?.trim();
    if (!companyId) {
      return null;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    return company?.id ?? null;
  }

  private isHumanSenderType(senderType: MessageSenderType) {
    return (
      senderType === 'human' ||
      senderType === 'human_agent' ||
      senderType === 'agent'
    );
  }

  private async assertConversationInScope(
    conversationId: string,
    companyId?: string,
  ) {
    if (!companyId) {
      return;
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        companyId,
      },
      select: {
        id: true,
      },
    });

    if (!conversation) {
      throw new BadRequestException('Conversation not found for this company');
    }
  }

  private async createKbSuggestionFromHumanReply(params: {
    conversationId: string;
    companyId: string | null;
    humanAnswerMessageId: string;
    humanAnswer: string;
    occurredAt: Date;
  }) {
    if (!params.humanAnswer.trim()) {
      return null;
    }

    const existingSuggestion = await this.prisma.kbSuggestion.findFirst({
      where: {
        humanAnswerMessageId: params.humanAnswerMessageId,
      },
      select: { id: true },
    });

    if (existingSuggestion) {
      return existingSuggestion;
    }

    const customerMessage = await this.prisma.message.findFirst({
      where: {
        conversationId: params.conversationId,
        direction: 'inbound',
        content: { not: null },
        createdAt: { lte: params.occurredAt },
      },
      orderBy: [{ messageTimestamp: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        content: true,
      },
    });

    const question = customerMessage?.content?.trim() ?? '';
    if (!customerMessage || !question) {
      return null;
    }

    return this.prisma.kbSuggestion.create({
      data: {
        companyId: params.companyId,
        conversationId: params.conversationId,
        customerMessageId: customerMessage.id,
        humanAnswerMessageId: params.humanAnswerMessageId,
        question,
        answer: params.humanAnswer.trim(),
        status: 'pending',
        reviewedBy: null,
        createdBy: null,
        createdAt: new Date(),
        reviewedAt: null,
      },
      select: { id: true },
    });
  }

  async create(createMessageDto: CreateMessageDto, actor?: AuthenticatedUser) {
    const companyId = resolveCompanyScope(actor);
    await this.assertConversationInScope(createMessageDto.conversationId, companyId);

    const message = await this.messagesRepository.create({
      conversationId: createMessageDto.conversationId,
      companyId,
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
    const messageType = this.resolveMessageType(saveMessageDto.type);

    if (!content && this.isTextLikeMessage(messageType)) {
      return {
        saved: false,
        ignored: true,
        duplicate: false,
        reason: 'EMPTY_TEXT_MESSAGE',
        conversationId: saveMessageDto.conversationId ?? null,
        messageId: null,
      };
    }

    const externalMessageId = saveMessageDto.messageId?.trim() ?? null;
    const occurredAt = this.parseEventDate(saveMessageDto.eventAt);

    const requestedCompanyId = await this.resolveWorkflowCompanyId(saveMessageDto);
    const resolved = await this.resolveConversationId(saveMessageDto);
    const scopedCompanyId = resolved.companyId ?? requestedCompanyId ?? null;

    if (externalMessageId) {
      const existingByExternalId = await this.prisma.message.findFirst({
        where: {
          externalMessageId,
          ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
        },
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

    const conversationId = resolved.conversationId;
    const direction = saveMessageDto.direction;

    if (!direction) {
      throw new BadRequestException({
        code: 'DIRECTION_REQUIRED',
        message: 'direction must be inbound or outbound',
      });
    }
    const signatureWindowStart = new Date(occurredAt.getTime() - 90 * 1000);

    const nearDuplicate = externalMessageId || !content
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
      companyId: scopedCompanyId,
      externalMessageId,
      senderType,
      content,
      caption: saveMessageDto.caption ?? null,
      mediaUrl: saveMessageDto.mediaUrl ?? null,
      mediaId: saveMessageDto.mediaId ?? null,
      mimeType: saveMessageDto.mimeType ?? null,
      type: messageType,
      status,
      isFromCustomer: direction === 'inbound',
      rawPayload: saveMessageDto.rawPayload
        ? this.toJson(saveMessageDto.rawPayload)
        : undefined,
      occurredAt,
    });
    const kbSuggestion =
      direction === 'outbound' && this.isHumanSenderType(senderType)
        ? await this.createKbSuggestionFromHumanReply({
            conversationId,
            companyId: scopedCompanyId,
            humanAnswerMessageId: saved.id,
            humanAnswer: content,
            occurredAt,
          })
        : null;

    return {
      saved: true,
      ignored: false,
      duplicate: false,
      reason: null,
      ...MessageSerializer.serialize(saved),
      direction,
      externalMessageId,
      kbSuggestionId: kbSuggestion?.id ?? null,
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

  async sendMessage(
    sendMessageDto: SendMessageDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = resolveCompanyScope(actor);
    await this.assertConversationInScope(sendMessageDto.conversationId, companyId);

    const result = await this.whatsappService.reply({
      conversationId: sendMessageDto.conversationId,
      message: sendMessageDto.content,
      automated: false,
      senderId: sendMessageDto.senderId ?? actor?.sub ?? undefined,
      senderType: 'agent',
    }, actor);

    if (!result.storedMessageId) {
      return result;
    }

    const storedMessage = await this.messagesRepository.findById(
      result.storedMessageId,
      companyId,
    );

    return {
      ...MessageSerializer.serialize(storedMessage),
      whatsapp: result,
      kbSuggestionId: result.kbSuggestionId ?? null,
    };
  }

  async findAll(query: MessageQueryDto, actor?: AuthenticatedUser) {
    const result = await this.messagesRepository.findAll(
      query,
      resolveCompanyScope(actor),
    );

    return {
      data: MessageSerializer.serializeMany(result.data),
      meta: result.meta,
    };
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const message = await this.messagesRepository.findById(
      id,
      resolveCompanyScope(actor),
    );
    return MessageSerializer.serialize(message);
  }

  async updateStatus(
    id: string,
    updateMessageStatusDto: UpdateMessageStatusDto,
    actor?: AuthenticatedUser,
  ) {
    const message = await this.messagesRepository.updateStatus(
      id,
      updateMessageStatusDto.status,
      resolveCompanyScope(actor),
    );

    return MessageSerializer.serialize(message);
  }

  async remove(id: string, actor?: AuthenticatedUser) {
    const message = await this.messagesRepository.remove(
      id,
      resolveCompanyScope(actor),
    );
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
      senderType: 'human_agent',
    });
  }
}
