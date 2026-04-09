import { Module } from '@nestjs/common';

import { PrismaModule } from './database/prisma/prisma.module';
import { ConversationsGateway } from './gateways/conversations.gateway';
import { NotificationsGateway } from './gateways/notifications.gateway';
import { GeminiModule } from './integrations/gemini/gemini.module';

import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    PrismaModule,
    GeminiModule,
    AuthModule,
    AdminModule,
    CompaniesModule,
    SubscriptionsModule,
    UsersModule,
  ],
  providers: [ConversationsGateway, NotificationsGateway],
})
export class AppModule {}