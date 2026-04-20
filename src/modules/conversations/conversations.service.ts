import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { HandoffConversationDto } from './dto/handoff-conversation.dto';
import { ReactivateBotDto } from './dto/reactivate-bot.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import {
  ConversationEntity,
  ConversationStatus,
} from './entities/conversation.entity';

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
        contactName: data.contact?.fullName ?? data.contact?.whatsappName ?? undefined,
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

  async create(
    createConversationDto: CreateConversationDto,
  ): Promise<ConversationEntity> {
    const now = new Date();
    const status = this.normalizeStatus(createConversationDto.status);

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
        botPaused: createConversationDto.botActive === false,
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
        lastAgentReplyAt: conversation.lastHumanMessageAt?.toISOString() ?? null,
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

    await this.prisma.conversation.update({
      where: { id },
      data: {
        status: this.normalizeStatus(updateConversationStatusDto.status),
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

  async reactivateBot(id: string, reactivateBotDto: ReactivateBotDto) {
    await this.findOne(id);

    await this.prisma.conversation.update({
      where: { id },
      data: {
        botPaused: !reactivateBotDto.botActive,
        status: reactivateBotDto.botActive ? 'bot_active' : 'waiting_customer',
        handoffRequired: !reactivateBotDto.botActive,
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
}
