import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  buildEvolutionInstanceLookupCandidates,
  findMatchingEvolutionInstance,
} from '../../common/utils/evolution-instance.util';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { ConversationsService } from '../conversations/conversations.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { normalizeEvolutionWebhook } from '../webhooks/utils/webhook-normalizer.util';
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
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly whatsappService: WhatsappService,
  ) {}

  private async resolveRequiredCompanyId(
    actor: AuthenticatedUser | undefined,
    requestedCompanyId?: string | null,
    action = 'messages',
  ): Promise<string> {
    const actorCompanyId = resolveCompanyScope(actor);
    const requested = requestedCompanyId?.trim() || null;

    if (actorCompanyId) {
      if (requested && requested !== actorCompanyId) {
        throw new BadRequestException(
          'companyId is resolved from the authenticated user',
        );
      }

      return actorCompanyId;
    }

    if (!requested) {
      throw new BadRequestException(
        'companyId is required for strict multi-company message operations',
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: requested },
      select: { id: true, name: true, isActive: true, status: true },
    });

    if (!company) {
      throw new BadRequestException('Company not found for message operation');
    }

    this.logger.log(
      `MESSAGE_COMPANY_SCOPE action=${action} companyId=${company.id} companyName=${company.name} status=${company.status} isActive=${company.isActive}`,
    );

    return company.id;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private getPath(source: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }

      return (current as Record<string, unknown>)[key];
    }, source);
  }

  private firstDefined(...values: unknown[]): unknown {
    return values.find((value) => value !== undefined && value !== null);
  }

  private firstString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return null;
  }

  private firstBoolean(...values: unknown[]): boolean | null {
    for (const value of values) {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
      }

      if (typeof value === 'string' && value.trim()) {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n'].includes(normalized)) return false;
      }
    }

    return null;
  }

  private normalizeNullableString(value: unknown): string | null {
    return this.firstString(value);
  }

  private normalizeMessageTypeValue(value: unknown): MessageType {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (
      normalized === 'image' ||
      normalized === 'audio' ||
      normalized === 'document' ||
      normalized === 'video' ||
      normalized === 'button' ||
      normalized === 'list' ||
      normalized === 'unknown'
    ) {
      return normalized;
    }

    return 'text';
  }

  private normalizePhoneFromJid(value?: string | null): string | null {
    const normalized = value
      ?.replace(/@(s\.whatsapp\.net|c\.us|g\.us)$/i, '')
      .replace(/@[^@\s]+$/i, '')
      .replace(/[^0-9+]/g, '')
      .trim();

    return normalized || null;
  }

  private stringifyForLog(value: unknown, maxLength = 4000): string {
    try {
      const serialized = JSON.stringify(value);
      if (!serialized) {
        return 'null';
      }

      return serialized.length > maxLength
        ? `${serialized.slice(0, maxLength)}...`
        : serialized;
    } catch {
      return '[unserializable payload]';
    }
  }

  private normalizeIncomingSavePayload(
    payload: SaveMessageDto | Record<string, unknown>,
  ): SaveMessageDto {
    const raw = this.asRecord(payload);
    const rawPayload = this.asRecord(raw.rawPayload);
    const evolutionSource =
      Object.keys(rawPayload).length > 0 ? rawPayload : raw;
    const normalizedEvolution = normalizeEvolutionWebhook(evolutionSource);
    const rawRemoteJid =
      this.firstString(
        raw.rawRemoteJid,
        raw.remoteJid,
        this.getPath(raw, 'data.key.remoteJid'),
        this.getPath(rawPayload, 'data.key.remoteJid'),
        normalizedEvolution.conversationExternalId,
        normalizedEvolution.contactPhone,
      ) ?? null;
    const content =
      this.firstString(
        raw.content,
        raw.messageText,
        raw.text,
        raw.message,
        normalizedEvolution.messageText,
        normalizedEvolution.caption,
      ) ?? '';
    const instanceName =
      this.firstString(
        raw.instanceName,
        raw.instance,
        this.getPath(raw, 'data.instanceName'),
        this.getPath(raw, 'data.instance'),
        normalizedEvolution.instanceName,
      ) ?? undefined;
    const phoneNumber =
      this.firstString(
        raw.phoneNumber,
        raw.contactPhone,
        normalizedEvolution.contactPhone,
      ) ??
      this.normalizePhoneFromJid(rawRemoteJid) ??
      undefined;
    const messageId =
      this.firstString(
        raw.messageId,
        raw.id,
        this.getPath(raw, 'data.key.id'),
        this.getPath(rawPayload, 'data.key.id'),
        normalizedEvolution.externalMessageId,
      ) ?? undefined;
    const messageType = this.normalizeMessageTypeValue(
      this.firstDefined(raw.type, raw.messageType, normalizedEvolution.messageType),
    );
    const fromMe =
      this.firstBoolean(
        raw.fromMe,
        this.getPath(raw, 'data.key.fromMe'),
        this.getPath(rawPayload, 'data.key.fromMe'),
        normalizedEvolution.direction === 'outbound' ? true : undefined,
      ) ?? false;
    const eventAt =
      this.firstDefined(raw.eventAt, raw.timestamp, normalizedEvolution.eventAt) ??
      undefined;
    const normalizedRawPayload =
      Object.keys(rawPayload).length > 0 ? rawPayload : raw;

    return {
      ...(payload as SaveMessageDto),
      companyId: this.normalizeNullableString(raw.companyId) ?? undefined,
      conversationId:
        this.normalizeNullableString(raw.conversationId) ?? undefined,
      content,
      caption:
        this.normalizeNullableString(raw.caption) ??
        normalizedEvolution.caption ??
        null,
      mediaUrl:
        this.normalizeNullableString(raw.mediaUrl) ??
        normalizedEvolution.mediaUrl ??
        null,
      mediaId:
        this.normalizeNullableString(raw.mediaId) ??
        normalizedEvolution.mediaId ??
        null,
      mimeType:
        this.normalizeNullableString(raw.mimeType) ??
        normalizedEvolution.mimeType ??
        null,
      phoneNumber,
      contactName:
        this.normalizeNullableString(raw.contactName) ??
        normalizedEvolution.contactName ??
        undefined,
      instance: instanceName,
      instanceName,
      rawRemoteJid: rawRemoteJid ?? undefined,
      fromMe,
      status:
        this.normalizeNullableString(raw.status) ??
        normalizedEvolution.deliveryStatus ??
        'received',
      messageId,
      type: messageType,
      senderType: this.normalizeSenderTypeValue(raw.senderType),
      eventAt:
        eventAt instanceof Date
          ? eventAt.toISOString()
          : (eventAt as string | number | undefined),
      rawPayload: normalizedRawPayload,
    };
  }

  private normalizeSenderTypeValue(value: unknown): MessageSenderType | undefined {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (
      normalized === 'customer' ||
      normalized === 'human' ||
      normalized === 'human_agent' ||
      normalized === 'agent' ||
      normalized === 'bot' ||
      normalized === 'system'
    ) {
      return normalized;
    }

    return undefined;
  }

  private buildIgnoredIncomingResponse(
    payload: SaveMessageDto,
    reason: string,
  ) {
    return {
      saved: false,
      ignored: true,
      duplicate: false,
      reason,
      conversationId: payload.conversationId ?? null,
      messageId: null,
      externalMessageId: payload.messageId ?? null,
      instanceName: payload.instanceName ?? payload.instance ?? null,
      phoneNumber: payload.phoneNumber ?? null,
    };
  }

  private getMissingIncomingFields(payload: SaveMessageDto): string[] {
    const missingFields: string[] = [];
    const instanceName = payload.instanceName ?? payload.instance;
    const messageType = this.resolveMessageType(payload.type);
    const hasMedia =
      ['image', 'audio', 'video', 'document'].includes(messageType) &&
      Boolean(payload.mediaUrl || payload.mediaId || payload.caption);

    if (!instanceName?.trim()) {
      missingFields.push('instanceName');
    }

    if (!payload.phoneNumber?.trim() && !payload.rawRemoteJid?.trim()) {
      missingFields.push('remoteJid');
    }

    if (!payload.content?.trim() && this.isTextLikeMessage(messageType) && !hasMedia) {
      missingFields.push('messageText');
    }

    return missingFields;
  }

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

  private async findWhatsappInstanceByName(instanceName: string) {
    const candidates = buildEvolutionInstanceLookupCandidates(instanceName);
    const exact = candidates.length
      ? await this.prisma.companyWhatsappInstance.findFirst({
          where: {
            OR: candidates.map((candidate) => ({
              evolutionInstanceName: candidate,
            })),
          },
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (exact) {
      return exact;
    }

    const instances = await this.prisma.companyWhatsappInstance.findMany({
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return findMatchingEvolutionInstance(instances, instanceName);
  }

  private async resolveWorkflowCompanyId(saveMessageDto: SaveMessageDto) {
    const instanceName = (
      saveMessageDto.instanceName ??
      saveMessageDto.instance ??
      ''
    ).trim();

    if (instanceName) {
      const instance = await this.findWhatsappInstanceByName(instanceName);

      if (instance?.companyId) {
        if (
          saveMessageDto.companyId?.trim() &&
          saveMessageDto.companyId.trim() !== instance.companyId
        ) {
          throw new BadRequestException({
            code: 'COMPANY_SCOPE_MISMATCH',
            message: 'The WhatsApp instance is not linked to the requested company.',
          });
        }

        this.logger.log(
          `[INSTANCE_FOUND] instanceName=${instanceName} mappedInstance=${instance.evolutionInstanceName}`,
        );
        this.logger.log(
          `[COMPANY_FOUND] companyId=${instance.companyId} companyName=${instance.company?.name ?? 'unknown'}`,
        );

        return instance.companyId;
      }

      this.logger.warn(
        `[WEBHOOK_ERROR] Instance not mapped to company instanceName=${instanceName}`,
      );
      throw new BadRequestException({
        error: 'Instance not mapped to company',
        instanceName,
      });
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

    if (!(await this.shouldCreateKbSuggestion(params.conversationId))) {
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

  private async shouldCreateKbSuggestion(conversationId: string): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { handoffRequired: true },
    });

    if (conversation?.handoffRequired === true) {
      return true;
    }

    const latestAiRun = await this.prisma.aiRun.findFirst({
      where: {
        conversationId,
        OR: [
          { responseMode: 'HANDOFF_REQUIRED' },
          { handoffRequired: true },
          { reason: 'no_reliable_knowledge_base_answer' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    return Boolean(latestAiRun);
  }

  async create(createMessageDto: CreateMessageDto, actor?: AuthenticatedUser) {
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      createMessageDto.companyId,
      'create_message',
    );
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

    const nearDuplicate = externalMessageId || !content || direction === 'inbound'
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
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      query.companyId,
      'list_messages',
    );
    const result = await this.messagesRepository.findAll(
      query,
      companyId,
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

  async saveIncoming(payload: SaveMessageDto | Record<string, unknown>) {
    this.logger.log(`[WEBHOOK_RECEIVED] ${this.stringifyForLog(payload)}`);
    const raw = this.asRecord(payload);
    const normalized = this.normalizeIncomingSavePayload(payload);
    const explicitInboundValid = this.firstBoolean(raw.inboundValid);

    this.logger.log(
      `[WEBHOOK_NORMALIZED] ${this.stringifyForLog({
        instanceName: normalized.instanceName ?? normalized.instance ?? null,
        remoteJid: normalized.rawRemoteJid ?? null,
        fromMe: normalized.fromMe ?? false,
        messageId: normalized.messageId ?? null,
        pushName: normalized.contactName ?? null,
        messageText: normalized.content,
        messageType: normalized.type ?? 'text',
        timestamp: normalized.eventAt ?? null,
      })}`,
    );

    if (explicitInboundValid === false) {
      const reason =
        this.normalizeNullableString(raw.ignoreReason) ??
        'IGNORED_NON_INBOUND_OR_INVALID_MESSAGE';
      this.logger.log(`[WEBHOOK_IGNORED] reason=${reason}`);
      return this.buildIgnoredIncomingResponse(normalized, reason);
    }

    if (normalized.fromMe === true) {
      this.logger.log('[WEBHOOK_IGNORED] reason=MESSAGE_FROM_ME');
      return this.buildIgnoredIncomingResponse(normalized, 'MESSAGE_FROM_ME');
    }

    if (normalized.rawRemoteJid?.includes('@g.us')) {
      this.logger.log('[WEBHOOK_IGNORED] reason=GROUP_MESSAGE');
      return this.buildIgnoredIncomingResponse(normalized, 'GROUP_MESSAGE');
    }

    const missingFields = this.getMissingIncomingFields(normalized);
    if (missingFields.length > 0) {
      const error = {
        error: 'Missing required fields',
        missingFields,
      };
      this.logger.warn(`[WEBHOOK_ERROR] ${this.stringifyForLog(error)}`);
      throw new BadRequestException(error);
    }

    try {
      const result = await this.save({
        ...normalized,
        direction: 'inbound',
        senderType: 'customer',
      });

      const savedResult = result as {
        id?: string | null;
        messageId?: string | null;
        externalMessageId?: string | null;
        conversationId?: string | null;
      };
      this.logger.log(
        `[MESSAGE_SAVED] messageId=${savedResult.messageId ?? savedResult.id ?? 'null'} externalMessageId=${savedResult.externalMessageId ?? 'null'} conversationId=${savedResult.conversationId ?? 'null'}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `[WEBHOOK_ERROR] ${error instanceof Error ? error.message : this.stringifyForLog(error)}`,
      );
      throw error;
    }
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
