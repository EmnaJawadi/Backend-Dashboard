import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { ContactNotesModule } from './modules/contact-notes/contact-notes.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConversationTagsModule } from './modules/conversation-tags/conversation-tags.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessageTemplatesModule } from './modules/message-templates/message-templates.module';
import { MessagesModule } from './modules/messages/messages.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [
    AuthModule,
    ContactNotesModule,
    ContactsModule,
    ConversationTagsModule,
    ConversationsModule,
    MessageTemplatesModule,
    MessagesModule,
    SettingsModule,
    UsersModule,
    WhatsappModule,
  ],
})
export class AppModule {}