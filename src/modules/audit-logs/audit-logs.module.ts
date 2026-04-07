import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsRepository } from './audit-logs.repository';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditLogsRepository, PrismaService],
  exports: [AuditLogsService, AuditLogsRepository],
})
export class AuditLogsModule {}