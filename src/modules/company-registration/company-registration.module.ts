import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CompanyRegistrationController } from './company-registration.controller';
import { CompanyRegistrationService } from './company-registration.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CompanyRegistrationController],
  providers: [CompanyRegistrationService],
  exports: [CompanyRegistrationService],
})
export class CompanyRegistrationModule {}
