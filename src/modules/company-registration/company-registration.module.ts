import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { CompanyRegistrationController } from './company-registration.controller';
import { CompanyRegistrationService } from './company-registration.service';

@Module({
  imports: [MailModule],
  controllers: [CompanyRegistrationController],
  providers: [CompanyRegistrationService],
  exports: [CompanyRegistrationService],
})
export class CompanyRegistrationModule {}
