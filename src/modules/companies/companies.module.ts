import { Module } from '@nestjs/common';
import { EvolutionApiClient } from '../../integrations/whatsapp/evolution-api.client';
import { CompaniesController, EvolutionController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  controllers: [CompaniesController, EvolutionController],
  providers: [CompaniesService, EvolutionApiClient],
  exports: [CompaniesService],
})
export class CompaniesModule {}
