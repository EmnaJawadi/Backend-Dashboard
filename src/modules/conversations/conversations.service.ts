import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import {
  ConversationEntity,
  ConversationStatus,
} from './entities/conversation.entity';

type ConversationAutomationState = {
  id: string;
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
  constructor(private readonly prisma: PrismaService) {}

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
      conversation.handoffRequired === true ||
      conversation.status === 'human_assigned' ||
      Boolean(conversation.assignedTo)
    );
  }

  private shouldRefreshName(existing?: string | null, incoming?: string | null) {
    if (!incoming) return false;
    if (!existing) return true;
    return existing.trim().toLowerCase() !== incoming.trim().toLowerCase();
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

    const [existingMessage, inboundWebhookEventsCount] =
      await this.prisma.$transaction([
        this.prisma.message.findFirst({
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
        }),
        this.prisma.webhookEvent.count({
          where: {
            externalEventId: normalizedMessageId,
            eventType: 'inbound_message',
            ...(params.companyId ? { companyId: params.companyId } : {}),
            processingStatus: { in: ['pending', 'processed'] },
          },
        }),
      ]);

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
      throw new BadRequestException({
        code: 'COMPANY_RESOLUTION_FAILED',
        message:
          'Unable to resolve company from instance/companyId. Provide companyId or a mapped Evolution instance.',
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
      return this.toWhatsappWorkflowResponse(duplicateCheck.conversation, {
        ignored: true,
        duplicate: true,
        reason: 'DUPLICATE_INBOUND_MESSAGE',
      });
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
        const shouldRefreshInboundTimeline =
          !conversation.lastCustomerMessageAt ||
          eventAt.getTime() > conversation.lastCustomerMessageAt.getTime();

        conversation = await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            botPaused: shouldPauseBot ? true : conversation.botPaused,
            lastCustomerMessageAt: shouldRefreshInboundTimeline
              ? eventAt
              : undefined,
            lastMessageAt: shouldRefreshInboundTimeline ? eventAt : undefined,
            updatedAt: new Date(),
          },
          select: {
            id: true,
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

    return this.toWhatsappWorkflowResponse(workflowState.conversation, {
      ignored: false,
      duplicate: false,
      reason: null,
    });
  }

  async create(
    createConversationDto: CreateConversationDto,
  ): Promise<ConversationEntity> {
    const now = new Date();
    const status = this.normalizeStatus(createConversationDto.status);
    const shouldPauseBot =
      status === 'human_assigned' || createConversationDto.botActive === false;

    if (createConversationDto.contactName || createConversationDto.phoneNumber) {
      await this.prisma.contact.update({
        where: { id: createConversationDto.contactId },
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

  async findAll(query: ConversationQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const andFilters: Prisma.ConversationWhereInput[] = [];

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

  async findOne(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        tags: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with id ${id} not found`);
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

  async update(id: string, updateConversationDto: UpdateConversationDto) {
    const existing = await this.findOne(id);
    const now = new Date();

    if (updateConversationDto.contactName || updateConversationDto.phoneNumber) {
      await this.prisma.contact.update({
        where: { id: existing.participant.contactId },
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
          direction: 'outbound',
          senderType: 'agent',
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

    return this.findOne(id);
  }

  async updateStatus(
    id: string,
    updateConversationStatusDto: UpdateConversationStatusDto,
  ) {
    await this.findOne(id);
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

    return this.findOne(id);
  }

  async assign(id: string, assignConversationDto: AssignConversationDto) {
    await this.findOne(id);

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

    return this.findOne(id);
  }

  async handoff(id: string, handoffConversationDto: HandoffConversationDto) {
    await this.findOne(id);

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

    return this.findOne(id);
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
            assignedTo: workflowHandoffDto.assignedTo ?? conversation.assignedTo ?? null,
            status: 'human_assigned',
            botPaused: true,
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

  async reactivateBot(id: string, reactivateBotDto: ReactivateBotDto) {
    await this.findOne(id);
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

    return this.findOne(id);
  }

  async remove(id: string) {
    const existing = await this.findOne(id);

    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { conversationId: id } }),
      this.prisma.conversationTag.deleteMany({ where: { conversationId: id } }),
      this.prisma.conversation.delete({ where: { id } }),
    ]);

    return existing;
  }

  async findContext(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
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

  async updateContext(id: string, dto: UpdateConversationContextDto) {
    await this.findConversationStateOrThrow(id);

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

  private async resolveCompanyIdForWhatsapp(dto: GetOrCreateConversationDto) {
    if (dto.companyId?.trim()) {
      return dto.companyId.trim();
    }

    if (!dto.instance?.trim()) {
      return null;
    }

    const mapping = await this.prisma.companyWhatsappInstance.findUnique({
      where: { evolutionInstanceName: dto.instance.trim() },
      select: { companyId: true },
    });

    return mapping?.companyId ?? null;
  }
}
