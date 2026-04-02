import { Module } from '@nestjs/common';
import { ConversationTagsController } from './conversation-tags.controller';
import { ConversationTagsRepository } from './conversation-tags.repository';
import { ConversationTagsService } from './conversation-tags.service';

@Module({
  controllers: [ConversationTagsController],
  providers: [ConversationTagsService, ConversationTagsRepository],
  exports: [ConversationTagsService, ConversationTagsRepository],
})
export class ConversationTagsModule {}