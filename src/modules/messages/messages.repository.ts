import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { MessageQueryDto } from './dto/message-query.dto';
import {
  MessageEntity,
  MessageStatus,
  MessageType,
} from './entities/message.entity';

type MessageWriteData = Partial<MessageEntity> & {
  externalMessageId?: string | null;
  companyId?: string | null;
  rawPayload?: Prisma.InputJsonValue;
  occurredAt?: Date;
  caption?: string | null;
  mediaUrl?: string | null;
  mediaId?: string | null;
  mimeType?: string | null;
};

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeType(value?: string | null): MessageType {
    if (
      value === 'image' ||
      value === 'audio' ||
      value === 'document' ||
      value === 'video' ||
      value === 'button' ||
      value === 'list' ||
      value === 'unknown'
    ) {
      return value;
    }
    return 'text';
  }

  private normalizeStatus(value?: string | null): MessageStatus {
    if (value === 'received' || value === 'queued') {
      return 'delivered';
    }

    if (value === 'delivered' || value === 'read' || value === 'failed') {
      return value;
    }

    return 'sent';
  }

  private toEntity(row: {
    id: string;
    conversationId: string;
    senderType: string | null;
    content: string | null;
    messageType: string | null;
    rawPayload?: Prisma.JsonValue | null;
    deliveryStatus: string | null;
    direction: string | null;
    createdAt: Date;
  }): MessageEntity {
    const senderType = (row.senderType ??
      'system') as MessageEntity['senderType'];

    return new MessageEntity({
      id: row.id,
      conversationId: row.conversationId,
      senderType,
      senderId: null,
      content: row.content ?? '',
      type: this.normalizeType(row.messageType),
      status: this.normalizeStatus(row.deliveryStatus),
      isFromCustomer: row.direction === 'inbound' || senderType === 'customer',
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    });
  }

  async create(data: MessageWriteData): Promise<MessageEntity> {
    const now = data.occurredAt ?? new Date();
    const senderType = data.senderType ?? 'system';
    const direction =
      data.isFromCustomer || senderType === 'customer'
        ? 'inbound'
        : 'outbound';

    const resolvedCompanyId =
      data.companyId ??
      (
        await this.prisma.conversation.findUnique({
          where: { id: data.conversationId ?? '' },
          select: { companyId: true },
        })
      )?.companyId ??
      null;

    if (!resolvedCompanyId) {
      throw new BadRequestException('Message must be linked to a company');
    }

    const created = await this.prisma.message.create({
      data: {
        companyId: resolvedCompanyId,
        conversationId: data.conversationId ?? '',
        externalMessageId: data.externalMessageId ?? null,
        direction,
        senderType,
        content: data.content ?? null,
        messageType: data.type ?? 'text',
        caption: data.caption ?? null,
        mediaId: data.mediaId ?? null,
        mediaUrl: data.mediaUrl ?? null,
        mimeType: data.mimeType ?? null,
        rawPayload: this.buildRawPayload(data),
        deliveryStatus: data.status ?? 'sent',
        errorMessage: null,
        createdAt: now,
        messageTimestamp: now,
      },
    });

    await this.touchConversation({
      conversationId: created.conversationId,
      direction,
      senderType,
      at: now,
    });

    return this.toEntity(created);
  }

  async findAll(query: MessageQueryDto, companyId?: string) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    const where = {
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(companyId ? { companyId } : {}),
      ...(query.senderType ? { senderType: query.senderType } : {}),
      ...(query.type ? { messageType: query.type } : {}),
      ...(query.status ? { deliveryStatus: query.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toEntity(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string, companyId?: string): Promise<MessageEntity> {
    const row = await this.prisma.message.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!row) {
      throw new NotFoundException(`Message with id ${id} not found`);
    }

    return this.toEntity(row);
  }

  async updateStatus(
    id: string,
    status: MessageEntity['status'],
    companyId?: string,
  ): Promise<MessageEntity> {
    await this.findById(id, companyId);

    const row = await this.prisma.message.update({
      where: { id },
      data: {
        deliveryStatus: status,
      },
    });

    return this.toEntity(row);
  }

  async remove(id: string, companyId?: string): Promise<MessageEntity> {
    await this.findById(id, companyId);

    const row = await this.prisma.message.delete({
      where: { id },
    });

    return this.toEntity(row);
  }

  private buildRawPayload(
    data: MessageWriteData,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return data.rawPayload ?? Prisma.JsonNull;
  }

  private async touchConversation(params: {
    conversationId: string;
    direction: string;
    senderType: string;
    at: Date;
  }) {
    if (!params.conversationId) {
      return;
    }

    await this.prisma.conversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: params.at,
        lastCustomerMessageAt:
          params.direction === 'inbound' ? params.at : undefined,
        lastBotMessageAt: params.senderType === 'bot' ? params.at : undefined,
        lastHumanMessageAt:
          params.senderType === 'human' ||
          params.senderType === 'agent' ||
          params.senderType === 'human_agent'
            ? params.at
            : undefined,
        unreadCount:
          params.direction === 'inbound' ? { increment: 1 } : undefined,
        updatedAt: params.at,
      },
    });
  }
}
