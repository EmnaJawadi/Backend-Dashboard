import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentRegistrationController } from './agent-registration.controller';
import { AgentRegistrationService } from './agent-registration.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AgentRegistrationController],
  providers: [AgentRegistrationService],
  exports: [AgentRegistrationService],
})
export class AgentRegistrationModule {}
