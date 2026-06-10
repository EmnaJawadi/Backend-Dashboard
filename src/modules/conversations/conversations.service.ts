import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  buildEvolutionInstanceLookupCandidates,
  findMatchingEvolutionInstance,
} from '../../common/utils/evolution-instance.util';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { GetOrCreateConversationDto } from './dto/get-or-create-conversation.dto';
import { HandoffConversationDto } from './dto/handoff-conversation.dto';
import { ReactivateBotDto } from './dto/reactivate-bot.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { UpdateConversationContextDto } from './dto/update-conversation-context.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { WorkflowHandoffDto } from './dto/workflow-handoff.dto';
import { WorkflowOrderIntentDto } from './dto/workflow-order-intent.dto';
import {
  ConversationEntity,
  ConversationStatus,
} from './entities/conversation.entity';

type ConversationAutomationState = {
  id: string;
  companyId: string | null;
  contactId: string;
  assignedTo: string | null;
  status: string | null;
  botPaused: boolean | null;
  handoffRequired: boolean | null;
  lastCustomerMessageAt: Date | null;
  lastMessageAt: Date | null;
};

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async resolveRequiredCompanyId(
    actor: AuthenticatedUser | undefined,
    requestedCompanyId?: string | null,
    action = 'conversations',
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
        'companyId is required for strict multi-company conversation operations',
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: requested },
      select: { id: true, name: true, isActive: true, status: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found for conversation operation');
    }

    this.logger.log(
      `CONVERSATION_COMPANY_SCOPE action=${action} companyId=${company.id} companyName=${company.name} status=${company.status} isActive=${company.isActive}`,
    );

    return company.id;
  }

  private toEntity(data: {
    id: string;
    contactId: string;
    assignedTo: string | null;
    status: string | null;
    botPaused: boolean | null;
    unreadCount: number | null;
    createdAt: Date;
    updatedAt: Date;
    contact?: {
      fullName: string | null;
      whatsappName: string | null;
      phone: string | null;
    } | null;
    tags?: Array<{
      id: string;
      tag: string;
      color?: string | null;
    }>;
    messages?: Array<{
      id: string;
      content: string | null;
    }>;
  }): ConversationEntity {
    const status = this.normalizeStatus(data.status);

    return new ConversationEntity({
      id: data.id,
      participant: {
        contactId: data.contactId,
        contactName:
          data.contact?.fullName ?? data.contact?.whatsappName ?? undefined,
        phoneNumber: data.contact?.phone ?? undefined,
      },
      status,
      assignedTo: data.assignedTo ?? null,
      botActive: !(data.botPaused ?? false),
      tags: (data.tags ?? []).map((item) => ({
        id: item.id,
        name: item.tag,
        color: item.color ?? undefined,
      })),
      lastMessage: data.messages?.[0]?.content ?? null,
      unreadCount: data.unreadCount ?? 0,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  private normalizeStatus(status?: string | null): ConversationStatus {
    if (!status) return 'human_assigned';
    if (status === 'open') return 'human_assigned';
    if (status === 'pending') return 'waiting_customer';
    if (status === 'human_handoff') return 'human_assigned';

    const allowed: ConversationStatus[] = [
      'closed',
      'bot_active',
      'human_assigned',
      'waiting_customer',
    ];

    return allowed.includes(status as ConversationStatus)
      ? (status as ConversationStatus)
      : 'human_assigned';
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

  private normalizePhoneCandidates(
    phoneNumber: string,
    rawRemoteJid?: string,
  ): string[] {
    const rawValues = [phoneNumber, rawRemoteJid]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.replace(/@s\.whatsapp\.net$/i, '').trim())
      .filter(Boolean);

    const candidates = new Set<string>();

    for (const rawValue of rawValues) {
      const cleaned = rawValue.replace(/[^0-9+]/g, '');
      if (!cleaned) continue;

      let normalized = cleaned;
      if (normalized.startsWith('00')) {
        normalized = `+${normalized.slice(2)}`;
      }

      if (normalized.startsWith('+')) {
        candidates.add(normalized);
      } else {
        candidates.add(normalized);
        candidates.add(`+${normalized}`);
      }

      const digitsOnly = normalized.replace(/\D/g, '');
      if (digitsOnly) {
        candidates.add(digitsOnly);
        candidates.add(`+${digitsOnly}`);
      }
    }

    return Array.from(candidates);
  }

  private normalizeContactName(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private shouldPauseBotForConversation(
    conversation: Pick<
      ConversationAutomationState,
      'assignedTo' | 'handoffRequired' | 'status' | 'botPaused'
    >,
  ): boolean {
    return (
      conversation.botPaused === true ||
      conversation.status === 'human_assigned' ||
      Boolean(conversation.assignedTo)
    );
  }

  private shouldRefreshName(existing?: string | null, incoming?: string | null) {
    if (!incoming) return false;
    if (!existing) return true;
    return existing.trim().toLowerCase() !== incoming.trim().toLowerCase();
  }

  private normalizeNullableString(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private toWhatsappWorkflowResponse(
    conversation: Pick<
      ConversationAutomationState,
      'id' | 'contactId' | 'assignedTo' | 'status' | 'botPaused' | 'handoffRequired'
    > & { companyId?: string | null },
    options?: {
      ignored?: boolean;
      duplicate?: boolean;
      reason?: string | null;
    },
  ) {
    return {
      conversationId: conversation.id,
      companyId: conversation.companyId ?? null,
      contactId: conversation.contactId,
      botPaused: this.shouldPauseBotForConversation(conversation),
      handoffRequired: conversation.handoffRequired ?? false,
      assignedTo: conversation.assignedTo ?? null,
      status: this.normalizeStatus(conversation.status),
      ignored: options?.ignored ?? false,
      duplicate: options?.duplicate ?? false,
      reason: options?.reason ?? null,
    };
  }

  private async findConversationStateOrThrow(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        companyId: true,
        contactId: true,
        assignedTo: true,
        status: true,
        botPaused: true,
        handoffRequired: true,
        lastCustomerMessageAt: true,
        lastMessageAt: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException(
        `Conversation with id ${conversationId} not found`,
      );
    }

    return conversation;
  }

  private async findInboundDuplicate(params: {
    messageId?: string;
    companyId: string | null;
  }) {
    const normalizedMessageId = params.messageId?.trim();
    if (!normalizedMessageId) {
      return {
        isDuplicate: false,
        conversation: null as ConversationAutomationState | null,
      };
    }

    const existingMessage = await this.prisma.message.findFirst({
      where: {
        externalMessageId: normalizedMessageId,
        direction: 'inbound',
        ...(params.companyId ? { companyId: params.companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        conversation: {
          select: {
            id: true,
            companyId: true,
            contactId: true,
            assignedTo: true,
            status: true,
            botPaused: true,
            handoffRequired: true,
            lastCustomerMessageAt: true,
            lastMessageAt: true,
          },
        },
      },
    });
    const inboundWebhookEventsCount = await this.prisma.webhookEvent.count({
      where: {
        externalEventId: normalizedMessageId,
        eventType: 'inbound_message',
        ...(params.companyId ? { companyId: params.companyId } : {}),
        processingStatus: { in: ['pending', 'processed'] },
      },
    });

    const isDuplicate =
      inboundWebhookEventsCount > 1 ||
      (inboundWebhookEventsCount === 0 && Boolean(existingMessage));

    return {
      isDuplicate,
      conversation: existingMessage?.conversation ?? null,
    };
  }

  async getOrCreateForWhatsapp(dto: GetOrCreateConversationDto) {
    const resolvedCompanyId = await this.resolveCompanyIdForWhatsapp(dto);
    if (!resolvedCompanyId) {
      const instanceName = this.normalizeNullableString(
        dto.instance ?? dto.instanceName,
      );

      if (instanceName) {
        throw new BadRequestException({
          error: 'Instance not mapped to company',
          instanceName,
        });
      }

      throw new BadRequestException({
        error: 'Missing required fields',
        missingFields: ['instanceName'],
      });
    }
    const phoneCandidates = this.normalizePhoneCandidates(
      dto.phoneNumber,
      dto.rawRemoteJid,
    );

    if (!phoneCandidates.length) {
      throw new BadRequestException({
        code: 'PHONE_NUMBER_REQUIRED',
        message: 'phoneNumber (or rawRemoteJid) is required.',
      });
    }

    const eventAt = this.parseEventDate(dto.eventAt);
    const incomingName = this.normalizeContactName(dto.contactName);
    const duplicateCheck = await this.findInboundDuplicate({
      messageId: dto.messageId,
      companyId: resolvedCompanyId,
    });

    if (duplicateCheck.isDuplicate && duplicateCheck.conversation) {
      const response = this.toWhatsappWorkflowResponse(duplicateCheck.conversation, {
        ignored: true,
        duplicate: true,
        reason: 'DUPLICATE_INBOUND_MESSAGE',
      });
      this.logger.log(
        `get-or-create duplicate: companyId=${response.companyId ?? 'null'} contactId=${response.contactId} conversationId=${response.conversationId}`,
      );

      return response;
    }

    const workflowState = await this.prisma.$transaction(async (tx) => {
      let contact = await tx.contact.findFirst({
        where: {
          ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}),
          OR: phoneCandidates.map((phone) => ({ phone })),
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (contact) {
        const shouldUpdatePhone =
          !contact.phone && phoneCandidates.length > 0;
        const shouldUpdateFullName = this.shouldRefreshName(
          contact.fullName,
          incomingName,
        );
        const shouldUpdateWhatsappName = this.shouldRefreshName(
          contact.whatsappName,
          incomingName,
        );

        contact = await tx.contact.update({
          where: { id: contact.id },
          data: {
            phone: shouldUpdatePhone ? phoneCandidates[0] : undefined,
            companyId: !contact.companyId && resolvedCompanyId ? resolvedCompanyId : undefined,
            fullName: shouldUpdateFullName ? incomingName : undefined,
            whatsappName: shouldUpdateWhatsappName ? incomingName : undefined,
            lastSeen: eventAt,
            updatedAt: new Date(),
          },
        });
      } else {
        contact = await tx.contact.create({
          data: {
            phone: phoneCandidates[0],
            companyId: resolvedCompanyId,
            fullName: incomingName,
            whatsappName: incomingName,
            email: null,
            language: null,
            city: null,
            country: null,
            tags: [],
            notes: null,
            segment: null,
            source: 'whatsapp_inbound',
            status: 'active',
            lastSeen: eventAt,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      let conversation = await tx.conversation.findFirst({
        where: {
          ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}),
          contactId: contact.id,
          status: { not: 'closed' },
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          companyId: true,
          contactId: true,
          assignedTo: true,
          status: true,
          botPaused: true,
          handoffRequired: true,
          lastCustomerMessageAt: true,
          lastMessageAt: true,
        },
      });

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            companyId: resolvedCompanyId,
            contactId: contact.id,
            channel: 'whatsapp',
            status: 'bot_active',
            priority: 'medium',
            assignedTo: null,
            botPaused: false,
            handoffRequired: false,
            unreadCount: 0,
            lastMessageAt: eventAt,
            lastCustomerMessageAt: eventAt,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          select: {
            id: true,
            companyId: true,
            contactId: true,
            assignedTo: true,
            status: true,
            botPaused: true,
            handoffRequired: true,
            lastCustomerMessageAt: true,
            lastMessageAt: true,
          },
        });
      } else {
        const shouldPauseBot = this.shouldPauseBotForConversation(conversation);
        const shouldResumeAiAutomation =
          conversation.status === 'human_assigned' &&
          !conversation.assignedTo &&
          conversation.handoffRequired === true;
        const shouldRefreshInboundTimeline =
          !conversation.lastCustomerMessageAt ||
          eventAt.getTime() > conversation.lastCustomerMessageAt.getTime();

        conversation = await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            status: shouldResumeAiAutomation ? 'waiting_customer' : undefined,
            botPaused: shouldResumeAiAutomation
              ? false
              : shouldPauseBot
                ? true
                : conversation.botPaused,
            lastCustomerMessageAt: shouldRefreshInboundTimeline
              ? eventAt
              : undefined,
            lastMessageAt: shouldRefreshInboundTimeline ? eventAt : undefined,
            updatedAt: new Date(),
          },
          select: {
            id: true,
            companyId: true,
            contactId: true,
            assignedTo: true,
            status: true,
            botPaused: true,
            handoffRequired: true,
            lastCustomerMessageAt: true,
            lastMessageAt: true,
          },
        });
      }

      return {
        contact,
        conversation,
      };
    });

    const response = this.toWhatsappWorkflowResponse(workflowState.conversation, {
      ignored: false,
      duplicate: false,
      reason: null,
    });
    this.logger.log(
      `get-or-create resolved: companyId=${response.companyId ?? 'null'} contactId=${response.contactId} conversationId=${response.conversationId}`,
    );
    this.logger.log(
      `[CONTACT_FOUND_OR_CREATED] contactId=${workflowState.contact.id}`,
    );
    this.logger.log(
      `[CONVERSATION_FOUND_OR_CREATED] conversationId=${workflowState.conversation.id}`,
    );

    return response;
  }

  async create(
    createConversationDto: CreateConversationDto,
    actor?: AuthenticatedUser,
  ): Promise<ConversationEntity> {
    const now = new Date();
    const actorCompanyId = resolveCompanyScope(actor);
    const requestedCompanyId = createConversationDto.companyId?.trim() || null;

    if (
      actorCompanyId &&
      requestedCompanyId &&
      requestedCompanyId !== actorCompanyId
    ) {
      throw new BadRequestException(
        'companyId is resolved from the authenticated user',
      );
    }

    const companyId = actorCompanyId ?? requestedCompanyId ?? undefined;
    const status = this.normalizeStatus(createConversationDto.status);
    const shouldPauseBot =
      status === 'human_assigned' || createConversationDto.botActive === false;
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: createConversationDto.contactId,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!contact) {
      throw new NotFoundException(
        `Contact with id ${createConversationDto.contactId} not found`,
      );
    }

    const resolvedCompanyId = contact.companyId ?? companyId ?? null;

    if (!resolvedCompanyId) {
      throw new BadRequestException('Conversation must be linked to a company');
    }

    if (companyId && resolvedCompanyId !== companyId) {
      throw new BadRequestException(
        'Contact does not belong to the requested company',
      );
    }

    if (createConversationDto.contactName || createConversationDto.phoneNumber) {
      await this.prisma.contact.updateMany({
        where: {
          id: createConversationDto.contactId,
          ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}),
        },
        data: {
          fullName: createConversationDto.contactName ?? undefined,
          whatsappName: createConversationDto.contactName ?? undefined,
          phone: createConversationDto.phoneNumber ?? undefined,
          updatedAt: now,
        },
      });
    }

    const created = await this.prisma.conversation.create({
      data: {
        companyId: resolvedCompanyId,
        contactId: createConversationDto.contactId,
        channel: 'whatsapp',
        status,
        priority: 'medium',
        assignedTo: createConversationDto.assignedTo ?? null,
        botPaused: shouldPauseBot,
        handoffRequired: status === 'human_assigned',
        unreadCount: 0,
        lastMessageAt: createConversationDto.lastMessage ? now : null,
        lastCustomerMessageAt: createConversationDto.lastMessage ? now : null,
        createdAt: now,
        updatedAt: now,
        messages: createConversationDto.lastMessage
          ? {
              create: [
                {
                  companyId: resolvedCompanyId,
                  direction: 'inbound',
                  senderType: 'customer',
                  content: createConversationDto.lastMessage,
                  messageType: 'text',
                  deliveryStatus: 'read',
                  createdAt: now,
                  messageTimestamp: now,
                },
              ],
            }
          : undefined,
      },
      include: {
        contact: true,
        tags: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return this.toEntity(created);
  }

  async findAll(query: ConversationQueryDto, actor?: AuthenticatedUser) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      query.companyId,
      'list_conversations',
    );
    const andFilters: Prisma.ConversationWhereInput[] = [];

    andFilters.push({ companyId });

    if (query.search?.trim()) {
      const search = query.search.trim();
      andFilters.push({
        OR: [
          { contact: { fullName: { contains: search, mode: 'insensitive' } } },
          {
            contact: { whatsappName: { contains: search, mode: 'insensitive' } },
          },
          { contact: { phone: { contains: search, mode: 'insensitive' } } },
          {
            messages: {
              some: {
                content: { contains: search, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }

    if (query.status) {
      andFilters.push({ status: this.normalizeStatus(query.status) });
    }

    if (query.assignedTo?.trim()) {
      andFilters.push({ assignedTo: query.assignedTo.trim() });
    }

    if (query.botActive !== undefined) {
      const botActive = query.botActive === 'true';
      andFilters.push({ botPaused: !botActive });
    }

    const where: Prisma.ConversationWhereInput =
      andFilters.length > 0 ? { AND: andFilters } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          contact: true,
          tags: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      data: rows.map((item) => this.toEntity(item)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const companyId = resolveCompanyScope(actor);
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        contact: true,
        tags: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        aiRuns: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            normalizedMessage: true,
            detectedLanguage: true,
            intent: true,
            outputText: true,
            responseMode: true,
            needsRag: true,
            usedKb: true,
            canAnswer: true,
            orderIntent: true,
            handoffRequired: true,
            status: true,
            reason: true,
            confidenceScore: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with id ${id} not found`);
    }

    if (!conversation.companyId?.trim()) {
      throw new BadRequestException('Conversation is not linked to a company');
    }

    const entity = this.toEntity(conversation);

    return {
      ...entity,
      contact: {
        id: conversation.contact.id,
        name:
          conversation.contact.fullName ??
          conversation.contact.whatsappName ??
          'Unknown contact',
        phone: conversation.contact.phone ?? '',
        email: conversation.contact.email ?? undefined,
        language: conversation.contact.language ?? undefined,
        location: [conversation.contact.city, conversation.contact.country]
          .filter(Boolean)
          .join(', '),
      },
      tags: conversation.tags.map((item) => ({
        id: item.id,
        label: item.tag,
      })),
      notes: conversation.contact.notes ?? undefined,
      activity: {
        assignedAgent: conversation.assignedTo ?? null,
        handoffRequired: conversation.handoffRequired ?? false,
        botActive: !(conversation.botPaused ?? false),
        lastBotMessageAt: conversation.lastBotMessageAt?.toISOString() ?? null,
        lastAgentReplyAt:
          conversation.lastHumanMessageAt?.toISOString() ?? null,
      },
      context: {
        conversationSummary: conversation.conversationSummary ?? null,
        customerIntent: conversation.customerIntent ?? null,
        requestedProductService: conversation.requestedProductService ?? null,
        requestedDeliveryDate: conversation.requestedDeliveryDate ?? null,
        deliveryAddress: conversation.deliveryAddress ?? null,
        budget: conversation.budget ?? null,
        agreedTerms: conversation.agreedTerms ?? null,
        nextAction: conversation.nextAction ?? null,
        lastAiDecision: conversation.lastAiDecision ?? null,
        importantNotes: conversation.importantNotes ?? null,
      },
      aiRuns: conversation.aiRuns.map((run) => ({
        ...run,
        createdAt: run.createdAt.toISOString(),
      })),
      messages: conversation.messages.map((item) => ({
        id: item.id,
        conversationId: item.conversationId,
        senderType: item.senderType ?? 'customer',
        direction: item.direction ?? 'inbound',
        type: item.messageType ?? 'text',
        content: item.content ?? '',
        timestamp:
          item.messageTimestamp?.toISOString() ?? item.createdAt.toISOString(),
        status: item.deliveryStatus ?? 'read',
      })),
    };
  }

  async update(
    id: string,
    updateConversationDto: UpdateConversationDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = resolveCompanyScope(actor);
    const existing = await this.findOne(id, actor);
    const scopedConversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        companyId: true,
      },
    });
    const now = new Date();

    if (updateConversationDto.contactName || updateConversationDto.phoneNumber) {
      await this.prisma.contact.updateMany({
        where: {
          id: existing.participant.contactId,
          ...(scopedConversation?.companyId
            ? { companyId: scopedConversation.companyId }
            : {}),
        },
        data: {
          fullName: updateConversationDto.contactName ?? undefined,
          whatsappName: updateConversationDto.contactName ?? undefined,
          phone: updateConversationDto.phoneNumber ?? undefined,
          updatedAt: now,
        },
      });
    }

    await this.prisma.conversation.update({
      where: { id },
      data: {
        status:
          updateConversationDto.status !== undefined
            ? this.normalizeStatus(updateConversationDto.status)
            : undefined,
        assignedTo: updateConversationDto.assignedTo ?? undefined,
        botPaused:
          updateConversationDto.botActive !== undefined
            ? !updateConversationDto.botActive
            : undefined,
        handoffRequired:
          updateConversationDto.botActive !== undefined
            ? !updateConversationDto.botActive
            : undefined,
        updatedAt: now,
      },
    });

    if (updateConversationDto.lastMessage?.trim()) {
      await this.prisma.message.create({
        data: {
          conversationId: id,
          companyId: scopedConversation?.companyId ?? companyId ?? null,
          direction: 'outbound',
          senderType: 'human_agent',
          content: updateConversationDto.lastMessage.trim(),
          messageType: 'text',
          deliveryStatus: 'sent',
          createdAt: now,
          messageTimestamp: now,
        },
      });

      await this.prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt: now,
          lastHumanMessageAt: now,
          updatedAt: now,
        },
      });
    }

    return this.findOne(id, actor);
  }

  async updateStatus(
    id: string,
    updateConversationStatusDto: UpdateConversationStatusDto,
    actor?: AuthenticatedUser,
  ) {
    await this.findOne(id, actor);
    const status = this.normalizeStatus(updateConversationStatusDto.status);

    await this.prisma.conversation.update({
      where: { id },
      data: {
        status,
        botPaused:
          status === 'human_assigned'
            ? true
            : status === 'bot_active' || status === 'waiting_customer'
              ? false
              : undefined,
        handoffRequired:
          status === 'human_assigned'
            ? true
            : status === 'bot_active' || status === 'waiting_customer'
              ? false
              : undefined,
        assignedTo: status === 'bot_active' ? null : undefined,
        updatedAt: new Date(),
      },
    });

    return this.findOne(id, actor);
  }

  async assign(
    id: string,
    assignConversationDto: AssignConversationDto,
    actor?: AuthenticatedUser,
  ) {
    await this.findOne(id, actor);

    await this.prisma.conversation.update({
      where: { id },
      data: {
        assignedTo: assignConversationDto.userName ?? assignConversationDto.userId,
        status: 'human_assigned',
        botPaused: true,
        handoffRequired: true,
        updatedAt: new Date(),
      },
    });

    return this.findOne(id, actor);
  }

  async handoff(
    id: string,
    handoffConversationDto: HandoffConversationDto,
    actor?: AuthenticatedUser,
  ) {
    await this.findOne(id, actor);

    await this.prisma.conversation.update({
      where: { id },
      data: {
        assignedTo: handoffConversationDto.assignedTo,
        status: 'human_assigned',
        botPaused: true,
        handoffRequired: true,
        updatedAt: new Date(),
      },
    });

    return this.findOne(id, actor);
  }

  async handoffForWorkflow(workflowHandoffDto: WorkflowHandoffDto) {
    const conversation = await this.findConversationStateOrThrow(
      workflowHandoffDto.conversationId,
    );
    const now = new Date();
    const handoffRequired = workflowHandoffDto.handoffRequired !== false;

    const updated = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: handoffRequired
        ? {
            assignedTo: workflowHandoffDto.assignedTo ?? null,
            status: 'waiting_customer',
            botPaused: false,
            handoffRequired: true,
            updatedAt: now,
          }
        : {
            assignedTo: null,
            status: 'bot_active',
            botPaused: false,
            handoffRequired: false,
            updatedAt: now,
          },
      select: {
        id: true,
        companyId: true,
        contactId: true,
        assignedTo: true,
        status: true,
        botPaused: true,
        handoffRequired: true,
      },
    });

    return {
      success: true,
      conversationId: updated.id,
      handoffRequired: updated.handoffRequired ?? false,
      botPaused: updated.botPaused ?? false,
      assignedTo: updated.assignedTo ?? null,
      status: this.normalizeStatus(updated.status),
      reason: workflowHandoffDto.reason ?? null,
    };
  }

  async prepareOrderIntentForWorkflow(dto: WorkflowOrderIntentDto) {
    if (!dto.orderIntent) {
      return {
        success: true,
        prepared: false,
        conversationId: dto.conversationId,
        companyId: dto.companyId,
        contactId: dto.contactId,
      };
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: dto.conversationId,
        companyId: dto.companyId,
        contactId: dto.contactId,
      },
      select: {
        id: true,
        companyId: true,
        contactId: true,
      },
    });

    const contact = await this.prisma.contact.findFirst({
      where: {
        id: dto.contactId,
        companyId: dto.companyId,
      },
      select: {
        id: true,
        tags: true,
      },
    });

    if (!conversation || !contact) {
      throw new BadRequestException(
        'Conversation, company and contact do not match for order preparation',
      );
    }

    const existingTags = Array.isArray(contact.tags)
      ? contact.tags.filter((tag): tag is string => typeof tag === 'string')
      : [];
    const requestTags = this.requestTagsForAction(dto.orderDetails?.actionType);
    const tags = Array.from(new Set([...existingTags, ...requestTags]));
    const lastAiDecision = JSON.stringify({
      source: 'workflow_ai',
      orderIntent: true,
      intent: dto.intent,
      normalizedMessage: dto.normalizedMessage,
      detectedLanguage: dto.detectedLanguage ?? null,
      orderDetails: dto.orderDetails ?? null,
      keywordsForSearch: dto.keywordsForSearch ?? [],
      nextAction: 'prepare_customer_request',
    });

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          customerIntent: dto.intent,
          requestedProductService:
            dto.orderDetails?.requestedItem?.trim() || undefined,
          requestedDeliveryDate:
            dto.orderDetails?.requestedDate?.trim() || undefined,
          deliveryAddress: dto.orderDetails?.address?.trim() || undefined,
          nextAction: 'prepare_customer_request',
          lastAiDecision,
          updatedAt: new Date(),
        },
      }),
      this.prisma.contact.update({
        where: { id: contact.id },
        data: {
          tags,
          updatedAt: new Date(),
        },
      }),
      ...requestTags.map((tag) =>
        this.prisma.conversationTag.upsert({
          where: {
            conversationId_tag: {
              conversationId: conversation.id,
              tag,
            },
          },
          update: {
            companyId: dto.companyId,
          },
          create: {
            companyId: dto.companyId,
            conversationId: conversation.id,
            tag,
            createdAt: new Date(),
          },
        }),
      ),
    ]);

    this.logger.log(
      `ORDER_INTENT_PREPARED conversationId=${conversation.id} companyId=${conversation.companyId ?? 'null'} contactId=${conversation.contactId}`,
    );

    return {
      success: true,
      prepared: true,
      conversationId: conversation.id,
      companyId: conversation.companyId,
      contactId: conversation.contactId,
      nextAction: 'prepare_customer_request',
      tags,
    };
  }

  private requestTagsForAction(actionType?: string | null): string[] {
    const normalized = (actionType ?? '').trim().toLowerCase();
    const tag =
      normalized === 'reservation' || normalized === 'booking'
        ? 'demande_reservation'
        : normalized === 'appointment' || normalized === 'rendez_vous'
          ? 'demande_rendez_vous'
          : normalized === 'quote_request' || normalized === 'quote'
            ? 'demande_devis'
            : normalized === 'order' || normalized === 'purchase'
              ? 'demande_commande'
              : null;

    return tag ? ['demande_client', tag] : ['demande_client'];
  }

  async reactivateBot(
    id: string,
    reactivateBotDto: ReactivateBotDto,
    actor?: AuthenticatedUser,
  ) {
    await this.findOne(id, actor);
    const botActive = reactivateBotDto.botActive !== false;

    await this.prisma.conversation.update({
      where: { id },
      data: {
        botPaused: !botActive,
        status: botActive ? 'bot_active' : 'waiting_customer',
        handoffRequired: !botActive,
        assignedTo: botActive ? null : undefined,
        updatedAt: new Date(),
      },
    });

    return this.findOne(id, actor);
  }

  async remove(id: string, actor?: AuthenticatedUser) {
    const existing = await this.findOne(id, actor);

    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { conversationId: id } }),
      this.prisma.conversationTag.deleteMany({ where: { conversationId: id } }),
      this.prisma.conversation.delete({ where: { id } }),
    ]);

    return existing;
  }

  async findContext(id: string, actor?: AuthenticatedUser) {
    const companyId = resolveCompanyScope(actor);
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        contact: {
          select: {
            id: true,
            fullName: true,
            whatsappName: true,
            phone: true,
            email: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 25,
          select: {
            id: true,
            direction: true,
            senderType: true,
            content: true,
            createdAt: true,
            messageTimestamp: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with id ${id} not found`);
    }

    if (!conversation.companyId?.trim()) {
      throw new BadRequestException('Conversation is not linked to a company');
    }

    return {
      conversationId: conversation.id,
      companyId: conversation.companyId,
      contact: {
        id: conversation.contact.id,
        name:
          conversation.contact.fullName ??
          conversation.contact.whatsappName ??
          'Unknown contact',
        phone: conversation.contact.phone ?? null,
        email: conversation.contact.email ?? null,
      },
      context: {
        conversationSummary: conversation.conversationSummary ?? null,
        customerIntent: conversation.customerIntent ?? null,
        requestedProductService: conversation.requestedProductService ?? null,
        requestedDeliveryDate: conversation.requestedDeliveryDate ?? null,
        deliveryAddress: conversation.deliveryAddress ?? null,
        budget: conversation.budget ?? null,
        agreedTerms: conversation.agreedTerms ?? null,
        nextAction: conversation.nextAction ?? null,
        lastAiDecision: conversation.lastAiDecision ?? null,
        importantNotes: conversation.importantNotes ?? null,
      },
      history: conversation.messages
        .slice()
        .reverse()
        .map((message) => ({
          id: message.id,
          direction: message.direction ?? 'inbound',
          senderType: message.senderType ?? 'customer',
          content: message.content ?? '',
          timestamp:
            message.messageTimestamp?.toISOString() ??
            message.createdAt.toISOString(),
        })),
    };
  }

  async updateContext(
    id: string,
    dto: UpdateConversationContextDto,
    actor?: AuthenticatedUser,
  ) {
    await this.findOne(id, actor);

    const updated = await this.prisma.conversation.update({
      where: { id },
      data: {
        ...(dto.conversationSummary !== undefined
          ? { conversationSummary: dto.conversationSummary }
          : {}),
        ...(dto.customerIntent !== undefined
          ? { customerIntent: dto.customerIntent }
          : {}),
        ...(dto.requestedProductService !== undefined
          ? { requestedProductService: dto.requestedProductService }
          : {}),
        ...(dto.requestedDeliveryDate !== undefined
          ? { requestedDeliveryDate: dto.requestedDeliveryDate }
          : {}),
        ...(dto.deliveryAddress !== undefined
          ? { deliveryAddress: dto.deliveryAddress }
          : {}),
        ...(dto.budget !== undefined ? { budget: dto.budget } : {}),
        ...(dto.agreedTerms !== undefined ? { agreedTerms: dto.agreedTerms } : {}),
        ...(dto.nextAction !== undefined ? { nextAction: dto.nextAction } : {}),
        ...(dto.lastAiDecision !== undefined
          ? { lastAiDecision: dto.lastAiDecision }
          : {}),
        ...(dto.importantNotes !== undefined
          ? { importantNotes: dto.importantNotes }
          : {}),
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      conversationId: updated.id,
      context: {
        conversationSummary: updated.conversationSummary ?? null,
        customerIntent: updated.customerIntent ?? null,
        requestedProductService: updated.requestedProductService ?? null,
        requestedDeliveryDate: updated.requestedDeliveryDate ?? null,
        deliveryAddress: updated.deliveryAddress ?? null,
        budget: updated.budget ?? null,
        agreedTerms: updated.agreedTerms ?? null,
        nextAction: updated.nextAction ?? null,
        lastAiDecision: updated.lastAiDecision ?? null,
        importantNotes: updated.importantNotes ?? null,
      },
    };
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

  private async resolveCompanyIdForWhatsapp(dto: GetOrCreateConversationDto) {
    const requestedCompanyId = this.normalizeNullableString(dto.companyId);
    const instanceName = this.normalizeNullableString(
      dto.instance ?? dto.instanceName,
    );
    if (instanceName) {
      const mapping = await this.findWhatsappInstanceByName(instanceName);

      if (!mapping?.companyId) {
        this.logger.warn(
          `[WEBHOOK_ERROR] Instance not mapped to company instanceName=${instanceName}`,
        );
        return null;
      }

      if (requestedCompanyId && requestedCompanyId !== mapping.companyId) {
        throw new BadRequestException({
          code: 'COMPANY_SCOPE_MISMATCH',
          message: 'The WhatsApp instance is not linked to the requested company.',
        });
      }

      this.logger.log(
        `[INSTANCE_FOUND] instanceName=${instanceName} mappedInstance=${mapping.evolutionInstanceName}`,
      );
      this.logger.log(
        `[COMPANY_FOUND] companyId=${mapping.companyId} companyName=${mapping.company?.name ?? 'unknown'}`,
      );

      return mapping.companyId;
    }

    if (!requestedCompanyId) {
      return null;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: requestedCompanyId },
      select: { id: true },
    });

    return company?.id ?? null;
  }
}
