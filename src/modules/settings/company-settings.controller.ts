import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  UpdateCompanyAiSettingsDto,
  UpdateCompanyPreferencesDto,
  UpdateCompanyWorkflowSettingsDto,
} from './dto/update-company-settings.dto';
import { SettingsService } from './settings.service';

@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanySettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('settings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  getSettings(@CurrentUser() actor: AuthenticatedUser) {
    return this.settingsService.getCompanyPreferences(actor);
  }

  @Patch('settings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  updateSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateCompanyPreferencesDto,
  ) {
    return this.settingsService.updateCompanyPreferences(actor, dto);
  }

  @Get('ai-settings')
  @Roles(UserRole.SUPER_ADMIN)
  getAiSettings(@CurrentUser() actor: AuthenticatedUser) {
    return this.settingsService.getCompanyAiSettings(actor);
  }

  @Patch('ai-settings')
  @Roles(UserRole.SUPER_ADMIN)
  updateAiSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateCompanyAiSettingsDto,
  ) {
    return this.settingsService.updateCompanyAiSettings(actor, dto);
  }

  @Get('workflow-settings')
  @Roles(UserRole.SUPER_ADMIN)
  getWorkflowSettings(@CurrentUser() actor: AuthenticatedUser) {
    return this.settingsService.getCompanyWorkflowSettings(actor);
  }

  @Patch('workflow-settings')
  @Roles(UserRole.SUPER_ADMIN)
  updateWorkflowSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateCompanyWorkflowSettingsDto,
  ) {
    return this.settingsService.updateCompanyWorkflowSettings(actor, dto);
  }

  @Get('support-assignees')
  @Roles(UserRole.SUPER_ADMIN)
  getSupportAssignees(@CurrentUser() actor: AuthenticatedUser) {
    return this.settingsService.listCompanySupportAssignees(actor);
  }
}
