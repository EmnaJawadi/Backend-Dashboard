import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditLogsService } from './audit-logs.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Post()
  create(@Body() createAuditLogDto: CreateAuditLogDto) {
    return this.auditLogsService.create(createAuditLogDto);
  }

  @Get()
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auditLogsService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.auditLogsService.remove(id);
  }
}
