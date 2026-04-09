import { Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { MailModule } from './modules/mail/mail.module';

import { ContactNotesModule } from './modules/contact-notes/contact-notes.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConversationTagsModule } from './modules/conversation-tags/conversation-tags.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessageTemplatesModule } from './modules/message-templates/message-templates.module';
import { MessagesModule } from './modules/messages/messages.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

import { GeminiModule } from './integrations/gemini/gemini.module';
import { ConversationsGateway } from './gateways/conversations.gateway';
import { NotificationsGateway } from './gateways/notifications.gateway';

@Module({
  imports: [
    PrismaModule,
    GeminiModule,

    MailModule,
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
  providers: [ConversationsGateway, NotificationsGateway],
})
export class AppModule {}