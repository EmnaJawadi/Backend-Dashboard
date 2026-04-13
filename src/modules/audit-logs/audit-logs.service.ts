import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsRepository } from './audit-logs.repository';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogEntity } from './entities/audit-log.entity';

@Injectable()
export class AuditLogsService {
  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  async create(createAuditLogDto: CreateAuditLogDto): Promise<AuditLogEntity> {
    const auditLog = await this.auditLogsRepository.create(createAuditLogDto);
    return new AuditLogEntity(auditLog);
  }

  async findAll(query: AuditLogQueryDto) {
    const result = await this.auditLogsRepository.findMany(query);

    return {
      data: result.data.map((item) => new AuditLogEntity(item)),
      meta: result.meta,
    };
  }

  async findOne(id: string): Promise<AuditLogEntity> {
    const auditLog = await this.auditLogsRepository.findById(id);

    if (!auditLog) {
      throw new NotFoundException(`Audit log with ID "${id}" not found`);
    }

    return new AuditLogEntity(auditLog);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.auditLogsRepository.remove(id);
    return { message: 'Audit log deleted successfully' };
  }
}