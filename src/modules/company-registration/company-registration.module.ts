import { Module } from '@nestjs/common';
import { CompanyRegistrationController } from './company-registration.controller';
import { CompanyRegistrationService } from './company-registration.service';

@Module({
  controllers: [CompanyRegistrationController],
  providers: [CompanyRegistrationService],
  exports: [CompanyRegistrationService],
})
export class CompanyRegistrationModule {}
