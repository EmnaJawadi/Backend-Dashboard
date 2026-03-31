import { Module } from '@nestjs/common';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';

@Module({
  imports: [ContactsModule, ConversationsModule, MessagesModule],
})
export class AppModule {}