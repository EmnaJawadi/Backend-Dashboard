import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AddConversationTagDto } from './dto/add-conversation-tag.dto';
import { ConversationTagEntity } from './entities/conversation-tag.entity';

@Injectable()
export class ConversationTagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(row: {
    id: string;
    companyId: string | null;
    conversationId: string;
    tag: string;
    createdAt: Date;
  }) {
    return new ConversationTagEntity({
      id: row.id,
      companyId: row.companyId,
      conversationId: row.conversationId,
      label: row.tag,
      color: null,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    });
  }

  async add(
    data: AddConversationTagDto & { companyId?: string | null },
  ): Promise<ConversationTagEntity> {
    const now = new Date();

    const existing = await this.prisma.conversationTag.findFirst({
      where: {
        conversationId: data.conversationId,
        tag: data.label.trim(),
        ...(data.companyId ? { companyId: data.companyId } : {}),
      },
    });

    if (existing) {
      return this.toEntity(existing);
    }

    const tag = await this.prisma.conversationTag.create({
      data: {
        companyId: data.companyId ?? null,
        conversationId: data.conversationId,
        tag: data.label.trim(),
        createdAt: now,
      },
    });

    return this.toEntity(tag);
  }

  async findAll(
    conversationId?: string,
    companyId?: string,
  ): Promise<ConversationTagEntity[]> {
    const data = await this.prisma.conversationTag.findMany({
      where: {
        ...(conversationId ? { conversationId } : {}),
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { tag: 'asc' },
    });

    return data.map((item) => this.toEntity(item));
  }

  async findOne(
    id: string,
    companyId?: string,
  ): Promise<ConversationTagEntity> {
    const tag = await this.prisma.conversationTag.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!tag) {
      throw new NotFoundException(`Conversation tag with id ${id} not found`);
    }

    return this.toEntity(tag);
  }

  async removeByConversationAndLabel(
    conversationId: string,
    label: string,
    companyId?: string,
  ): Promise<ConversationTagEntity> {
    const tag = await this.prisma.conversationTag.findFirst({
      where: {
        conversationId,
        tag: label.trim(),
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!tag) {
      throw new NotFoundException(
        `Conversation tag "${label}" not found for conversation ${conversationId}`,
      );
    }

    const deleted = await this.prisma.conversationTag.delete({
      where: { id: tag.id },
    });

    return this.toEntity(deleted);
  }

  async removeById(
    id: string,
    companyId?: string,
  ): Promise<ConversationTagEntity> {
    await this.findOne(id, companyId);
    const deleted = await this.prisma.conversationTag.delete({ where: { id } });

    return this.toEntity(deleted);
  }
}
