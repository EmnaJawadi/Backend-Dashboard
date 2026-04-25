import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ConversationWorkflowController } from './conversation-workflow.controller';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [PrismaModule],
  controllers: [ConversationsController, ConversationWorkflowController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
