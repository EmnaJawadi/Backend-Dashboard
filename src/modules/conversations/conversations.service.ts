import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
  private readonly conversations: ConversationEntity[] = [];

  create(createConversationDto: CreateConversationDto): ConversationEntity {
    const now = new Date();

    const conversation = new ConversationEntity({
      id: randomUUID(),
      participant: {
        contactId: createConversationDto.contactId,
        contactName: createConversationDto.contactName,
        phoneNumber: createConversationDto.phoneNumber,
      },
      status: createConversationDto.status ?? 'open',
      assignedTo: createConversationDto.assignedTo ?? null,
      botActive: createConversationDto.botActive ?? true,
      tags: [],
      lastMessage: createConversationDto.lastMessage ?? null,
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    this.conversations.push(conversation);
    return conversation;
  }

  findAll(query: ConversationQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    let data = [...this.conversations];

    if (query.search) {
      const search = query.search.toLowerCase();
      data = data.filter(
        (conversation) =>
          conversation.participant.contactName?.toLowerCase().includes(search) ||
          conversation.participant.phoneNumber?.toLowerCase().includes(search) ||
          conversation.lastMessage?.toLowerCase().includes(search),
      );
    }

    if (query.status) {
      data = data.filter((conversation) => conversation.status === query.status);
    }

    if (query.assignedTo) {
      data = data.filter(
        (conversation) => conversation.assignedTo === query.assignedTo,
      );
    }

    if (query.botActive !== undefined) {
      const botActive = query.botActive === 'true';
      data = data.filter((conversation) => conversation.botActive === botActive);
    }

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

  findOne(id: string): ConversationEntity {
    const conversation = this.conversations.find((item) => item.id === id);

    if (!conversation) {
      throw new NotFoundException(`Conversation with id ${id} not found`);
    }

    return conversation;
  }

  update(id: string, updateConversationDto: UpdateConversationDto) {
    const conversation = this.findOne(id);

    if (updateConversationDto.contactName !== undefined) {
      conversation.participant.contactName = updateConversationDto.contactName;
    }

    if (updateConversationDto.phoneNumber !== undefined) {
      conversation.participant.phoneNumber = updateConversationDto.phoneNumber;
    }

    if (updateConversationDto.status !== undefined) {
      conversation.status = updateConversationDto.status;
    }

    if (updateConversationDto.assignedTo !== undefined) {
      conversation.assignedTo = updateConversationDto.assignedTo;
    }

    if (updateConversationDto.botActive !== undefined) {
      conversation.botActive = updateConversationDto.botActive;
    }

    if (updateConversationDto.lastMessage !== undefined) {
      conversation.lastMessage = updateConversationDto.lastMessage;
    }

    conversation.updatedAt = new Date();

    return conversation;
  }

  updateStatus(
    id: string,
    updateConversationStatusDto: UpdateConversationStatusDto,
  ) {
    const conversation = this.findOne(id);
    conversation.status = updateConversationStatusDto.status;
    conversation.updatedAt = new Date();

    return conversation;
  }

  assign(id: string, assignConversationDto: AssignConversationDto) {
    const conversation = this.findOne(id);
    conversation.assignedTo =
      assignConversationDto.userName ?? assignConversationDto.userId;
    conversation.status = 'pending';
    conversation.updatedAt = new Date();

    return conversation;
  }

  handoff(id: string, handoffConversationDto: HandoffConversationDto) {
    const conversation = this.findOne(id);
    conversation.assignedTo = handoffConversationDto.assignedTo;
    conversation.status = 'human_handoff';
    conversation.botActive = false;
    conversation.updatedAt = new Date();

    return conversation;
  }

  reactivateBot(id: string, reactivateBotDto: ReactivateBotDto) {
    const conversation = this.findOne(id);
    conversation.botActive = reactivateBotDto.botActive;

    if (reactivateBotDto.botActive) {
      conversation.status = 'bot_active' as ConversationStatus;
    }

    conversation.updatedAt = new Date();

    return conversation;
  }

  remove(id: string) {
    const index = this.conversations.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`Conversation with id ${id} not found`);
    }

    const deleted = this.conversations[index];
    this.conversations.splice(index, 1);

    return deleted;
  }
}