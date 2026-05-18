import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AddConversationTagDto } from './dto/add-conversation-tag.dto';
import { RemoveConversationTagDto } from './dto/remove-conversation-tag.dto';
import { ConversationTagsRepository } from './conversation-tags.repository';

@Injectable()
export class ConversationTagsService {
  constructor(
    private readonly conversationTagsRepository: ConversationTagsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async add(
    addConversationTagDto: AddConversationTagDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = resolveCompanyScope(actor);
    const conversation = await this.findConversationOrThrow(
      addConversationTagDto.conversationId,
      companyId,
    );

    return this.conversationTagsRepository.add({
      ...addConversationTagDto,
      companyId: conversation.companyId ?? companyId ?? null,
    });
  }

  findAll(conversationId?: string, actor?: AuthenticatedUser) {
    return this.conversationTagsRepository.findAll(
      conversationId,
      resolveCompanyScope(actor),
    );
  }

  findOne(id: string, actor?: AuthenticatedUser) {
    return this.conversationTagsRepository.findOne(
      id,
      resolveCompanyScope(actor),
    );
  }

  remove(
    removeConversationTagDto: RemoveConversationTagDto,
    actor?: AuthenticatedUser,
  ) {
    return this.conversationTagsRepository.removeByConversationAndLabel(
      removeConversationTagDto.conversationId,
      removeConversationTagDto.label,
      resolveCompanyScope(actor),
    );
  }

  removeById(id: string, actor?: AuthenticatedUser) {
    return this.conversationTagsRepository.removeById(
      id,
      resolveCompanyScope(actor),
    );
  }

  private async findConversationOrThrow(
    conversationId: string,
    companyId?: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        ...(companyId ? { companyId } : {}),
      },
      select: { companyId: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }
}
