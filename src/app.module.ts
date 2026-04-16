import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma/prisma.module';
import { AiModule } from './modules/ai/ai.module';
import { AiRunsModule } from './modules/ai-runs/ai-runs.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { MailModule } from './modules/mail/mail.module';

import { ContactNotesModule } from './modules/contact-notes/contact-notes.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConversationTagsModule } from './modules/conversation-tags/conversation-tags.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessageTemplatesModule } from './modules/message-templates/message-templates.module';
import { MessagesModule } from './modules/messages/messages.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

import { GeminiModule } from './integrations/gemini/gemini.module';
import { ConversationsGateway } from './gateways/conversations.gateway';
import { NotificationsGateway } from './gateways/notifications.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    GeminiModule,

    MailModule,
    AuthModule,
    AdminModule,
    AiModule,
    AiRunsModule,
    AuditLogsModule,

    ContactNotesModule,
    ContactsModule,
    ConversationTagsModule,
    ConversationsModule,
    MessageTemplatesModule,
    MessagesModule,
    AnalyticsModule,
    KnowledgeBaseModule,
    WebhooksModule,
    SettingsModule,
    UsersModule,
    WhatsappModule,
  ],
  providers: [ConversationsGateway, NotificationsGateway],
})
export class AppModule {}
