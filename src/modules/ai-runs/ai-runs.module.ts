import { Module } from '@nestjs/common';
import { AiRunsController } from './ai-runs.controller';
import { AiRunsService } from './ai-runs.service';
import { AiRunsRepository } from './ai-runs.repository';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [AiRunsController],
  providers: [AiRunsService, AiRunsRepository, PrismaService],
  exports: [AiRunsService, AiRunsRepository],
})
export class AiRunsModule {}