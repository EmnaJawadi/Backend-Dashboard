import {
  Body,
  Controller,
  Delete,
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
import { AdminService } from './admin.service';
import { CreateAdminSubscriptionDto } from './dto/create-admin-subscription.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { QueryAdminCompaniesDto } from './dto/query-admin-companies.dto';
import { QueryAdminSubscriptionsDto } from './dto/query-admin-subscriptions.dto';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { QueryMaintenanceAuditLogsDto } from './dto/query-maintenance-audit-logs.dto';
import { SetCompanyActivationDto } from './dto/set-company-activation.dto';
import { SetSubscriptionStatusDto } from './dto/set-subscription-status.dto';
import { SetUserActivationDto } from './dto/set-user-activation.dto';
import { UpdateAdminSubscriptionDto } from './dto/update-admin-subscription.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  @Roles(UserRole.SUPER_ADMIN)
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('maintenance/health')
  @Roles(UserRole.SUPER_ADMIN)
  getMaintenanceHealth() {
    return this.adminService.getMaintenanceHealth();
  }

  @Get('maintenance/audit-logs')
  @Roles(UserRole.SUPER_ADMIN)
  findMaintenanceAuditLogs(@Query() query: QueryMaintenanceAuditLogsDto) {
    return this.adminService.findMaintenanceAuditLogs(query);
  }

  @Get('maintenance/platform-settings')
  @Roles(UserRole.SUPER_ADMIN)
  getPlatformSettings() {
    return this.adminService.getPlatformSettings();
  }

  @Patch('maintenance/platform-settings')
  @Roles(UserRole.SUPER_ADMIN)
  updatePlatformSettings(
    @Body() updatePlatformSettingsDto: UpdatePlatformSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.updatePlatformSettings(updatePlatformSettingsDto, actor);
  }

  @Post('companies')
  @Roles(UserRole.SUPER_ADMIN)
  createCompany(
    @Body() createCompanyDto: CreateCompanyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.createCompany(createCompanyDto, actor);
  }

  @Get('companies')
  @Roles(UserRole.SUPER_ADMIN)
  findAllCompanies(@Query() query: QueryAdminCompaniesDto) {
    return this.adminService.findAllCompanies(query);
  }

  @Get('companies/:id')
  @Roles(UserRole.SUPER_ADMIN)
  findCompanyById(@Param('id') id: string) {
    return this.adminService.findCompanyById(id);
  }

  @Patch('companies/:id')
  @Roles(UserRole.SUPER_ADMIN)
  updateCompany(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.updateCompany(id, updateCompanyDto, actor);
  }

  @Patch('companies/:id/activation')
  @Roles(UserRole.SUPER_ADMIN)
  setCompanyActivation(
    @Param('id') id: string,
    @Body() dto: SetCompanyActivationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.setCompanyActivation(id, dto, actor);
  }

  @Delete('companies/:id')
  @Roles(UserRole.SUPER_ADMIN)
  removeCompany(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.removeCompany(id, actor);
  }

  @Post('subscriptions')
  @Roles(UserRole.SUPER_ADMIN)
  createSubscription(
    @Body() createSubscriptionDto: CreateAdminSubscriptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.createSubscription(createSubscriptionDto, actor);
  }

  @Get('subscriptions')
  @Roles(UserRole.SUPER_ADMIN)
  findAllSubscriptions(@Query() query: QueryAdminSubscriptionsDto) {
    return this.adminService.findAllSubscriptions(query);
  }

  @Get('subscriptions/:id')
  @Roles(UserRole.SUPER_ADMIN)
  findSubscriptionById(@Param('id') id: string) {
    return this.adminService.findSubscriptionById(id);
  }

  @Patch('subscriptions/:id')
  @Roles(UserRole.SUPER_ADMIN)
  updateSubscription(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateAdminSubscriptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.updateSubscription(id, updateSubscriptionDto, actor);
  }

  @Patch('subscriptions/:id/status')
  @Roles(UserRole.SUPER_ADMIN)
  setSubscriptionStatus(
    @Param('id') id: string,
    @Body() dto: SetSubscriptionStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.setSubscriptionStatus(id, dto, actor);
  }

  @Delete('subscriptions/:id')
  @Roles(UserRole.SUPER_ADMIN)
  removeSubscription(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.removeSubscription(id, actor);
  }

  @Post('users')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  createUser(
    @Body() createUserDto: CreateAdminUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.createUser(createUserDto, actor);
  }

  @Get('users')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  findAllUsers(
    @Query() query: QueryAdminUsersDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.findAllUsers(query, actor);
  }

  @Get('users/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  findUserById(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.findUserById(id, actor);
  }

  @Patch('users/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateAdminUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.updateUser(id, updateUserDto, actor);
  }

  @Patch('users/:id/activation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  setUserActivation(
    @Param('id') id: string,
    @Body() dto: SetUserActivationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.setUserActivation(id, dto, actor);
  }

  @Delete('users/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  removeUser(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminService.removeUser(id, actor);
  }
}
