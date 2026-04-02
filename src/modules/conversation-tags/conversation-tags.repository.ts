import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AddConversationTagDto } from './dto/add-conversation-tag.dto';
import { ConversationTagEntity } from './entities/conversation-tag.entity';

@Injectable()
export class ConversationTagsRepository {
  private readonly tags: ConversationTagEntity[] = [];

  add(data: AddConversationTagDto): ConversationTagEntity {
    const now = new Date();

    const existing = this.tags.find(
      (tag) =>
        tag.conversationId === data.conversationId &&
        tag.label.toLowerCase() === data.label.toLowerCase(),
    );

    if (existing) {
      return existing;
    }

    const tag = new ConversationTagEntity({
      id: randomUUID(),
      conversationId: data.conversationId,
      label: data.label.trim(),
      color: data.color ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.tags.push(tag);
    return tag;
  }

  findAll(conversationId?: string): ConversationTagEntity[] {
    const data = conversationId
      ? this.tags.filter((tag) => tag.conversationId === conversationId)
      : [...this.tags];

    return data.sort((a, b) => a.label.localeCompare(b.label));
  }

  findOne(id: string): ConversationTagEntity {
    const tag = this.tags.find((item) => item.id === id);

    if (!tag) {
      throw new NotFoundException(`Conversation tag with id ${id} not found`);
    }

    return tag;
  }

  removeByConversationAndLabel(
    conversationId: string,
    label: string,
  ): ConversationTagEntity {
    const index = this.tags.findIndex(
      (tag) =>
        tag.conversationId === conversationId &&
        tag.label.toLowerCase() === label.toLowerCase(),
    );

    if (index === -1) {
      throw new NotFoundException(
        `Conversation tag "${label}" not found for conversation ${conversationId}`,
      );
    }

    const deleted = this.tags[index];
    this.tags.splice(index, 1);

    return deleted;
  }

  removeById(id: string): ConversationTagEntity {
    const index = this.tags.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`Conversation tag with id ${id} not found`);
    }

    const deleted = this.tags[index];
    this.tags.splice(index, 1);

    return deleted;
  }
}