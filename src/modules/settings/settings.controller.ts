import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { QueryPlatformAuditLogsDto } from './dto/query-platform-audit-logs.dto';
import {
  UpdateCompanyAdminSettingsDto,
  UpdateCompanySettingsDto,
} from './dto/update-company-settings.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { SettingsService } from './settings.service';
import type { PlatformIntegrationHealth } from './entities/setting.entity';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('platform')
  @Roles(UserRole.SUPER_ADMIN)
  getPlatformSettings(@Query() query: QueryPlatformAuditLogsDto) {
    return this.settingsService.getPlatformSettings(query);
  }

  @Patch('platform')
  @Roles(UserRole.SUPER_ADMIN)
  updatePlatformSettings(
    @Body() dto: UpdatePlatformSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.settingsService.updatePlatformSettings(dto, actor);
  }

  @Post('platform/integrations/:key/test')
  @Roles(UserRole.SUPER_ADMIN)
  testPlatformIntegration(
    @Param('key') key: PlatformIntegrationHealth['key'],
  ) {
    return this.settingsService.testPlatformIntegration(key);
  }

  @Get('company')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  getCompanySettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.settingsService.getCompanySettings(actor, companyId);
  }

  @Patch('company')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  updateCompanySettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateCompanySettingsDto,
    @Query('companyId') companyId?: string,
  ) {
    return this.settingsService.updateCompanySettings(actor, dto, companyId);
  }

  @Patch('company/admin-only')
  @Roles(UserRole.SUPER_ADMIN)
  updateCompanyAdminSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateCompanyAdminSettingsDto,
  ) {
    return this.settingsService.updateCompanyAdminSettings(actor, dto);
  }

  @Get('agent-summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  getAgentSettingsSummary(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.settingsService.getAgentSettingsSummary(actor, companyId);
  }

  // Legacy compatibility for existing frontend integration.
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  getLegacyCompanySettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.settingsService.getCompanySettings(actor, companyId);
  }

  @Patch()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  updateLegacyCompanySettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateCompanySettingsDto,
    @Query('companyId') companyId?: string,
  ) {
    return this.settingsService.updateCompanySettings(actor, dto, companyId);
  }
}
