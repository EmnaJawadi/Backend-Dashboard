import { Injectable } from '@nestjs/common';
import { AddConversationTagDto } from './dto/add-conversation-tag.dto';
import { RemoveConversationTagDto } from './dto/remove-conversation-tag.dto';
import { ConversationTagsRepository } from './conversation-tags.repository';

@Injectable()
export class ConversationTagsService {
  constructor(
    private readonly conversationTagsRepository: ConversationTagsRepository,
  ) {}

  add(addConversationTagDto: AddConversationTagDto) {
    return this.conversationTagsRepository.add(addConversationTagDto);
  }

  findAll(conversationId?: string) {
    return this.conversationTagsRepository.findAll(conversationId);
  }

  findOne(id: string) {
    return this.conversationTagsRepository.findOne(id);
  }

  remove(removeConversationTagDto: RemoveConversationTagDto) {
    return this.conversationTagsRepository.removeByConversationAndLabel(
      removeConversationTagDto.conversationId,
      removeConversationTagDto.label,
    );
  }

  removeById(id: string) {
    return this.conversationTagsRepository.removeById(id);
  }
}