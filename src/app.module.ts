import { Module } from '@nestjs/common';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';

@Module({
  imports: [ConversationsModule, MessagesModule],
})
export class AppModule {}