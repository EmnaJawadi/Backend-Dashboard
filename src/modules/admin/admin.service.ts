import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { UserRole } from '../../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  CompanyStatus,
  Prisma,
  SubscriptionStatus,
} from '../../generated/prisma/client';
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
import { AdminRepository } from './admin.repository';

const PLATFORM_SETTINGS_KEY = 'platform_global_settings_v1';

@Injectable()
export class AdminService {
  constructor(private readonly adminRepository: AdminRepository) {}

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  private isSuperAdmin(user: AuthenticatedUser): boolean {
    return user.role === UserRole.SUPER_ADMIN;
  }

  private isCompanyAdmin(user: AuthenticatedUser): boolean {
    return user.role === UserRole.COMPANY_ADMIN;
  }

  private parseBooleanFilter(value?: string): boolean | undefined {
    if (value === undefined) return undefined;

    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') return true;
    if (normalized === 'false') return false;

    throw new BadRequestException(`Invalid boolean filter value: ${value}`);
  }

  private parseUserRole(role?: string): UserRole | undefined {
    if (!role) return undefined;

    const normalized = role.trim().toUpperCase();

    if (!(normalized in UserRole)) {
      throw new BadRequestException(`Invalid role value: ${role}`);
    }

    return UserRole[normalized as keyof typeof UserRole];
  }

  private parseCompanyStatus(status?: string): CompanyStatus | undefined {
    if (!status) return undefined;

    const normalized = status.trim().toUpperCase();

    if (!(normalized in CompanyStatus)) {
      throw new BadRequestException(`Invalid company status: ${status}`);
    }

    return CompanyStatus[normalized as keyof typeof CompanyStatus];
  }

  private parseSubscriptionStatus(status?: string): SubscriptionStatus | undefined {
    if (!status) return undefined;

    const normalized = status.trim().toUpperCase();

    if (!(normalized in SubscriptionStatus)) {
      throw new BadRequestException(`Invalid subscription status: ${status}`);
    }

    return SubscriptionStatus[normalized as keyof typeof SubscriptionStatus];
  }

  private normalizePagination(input: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(input.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(input.limit ?? 10)));

    return {
      page,
      limit,
    };
  }

  private getDefaultPlatformSettings() {
    return {
      platformName: 'Backend Dashboard',
      supportEmail: null,
      defaultLanguage: 'en',
      defaultCurrency: 'USD',
      maintenanceMode: false,
      allowUserInvitations: true,
      updatedAt: new Date().toISOString(),
    };
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.adminRepository.findCompanySummaryById(companyId);

    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found`);
    }

    return company;
  }

  private assertCompanyAdminScope(actor: AuthenticatedUser) {
    if (!actor.companyId) {
      throw new ForbiddenException('Company admin is not linked to a company');
    }

    return actor.companyId;
  }

  private ensureCompanyAdminCanManageRole(role: UserRole) {
    if (role !== UserRole.AGENT && role !== UserRole.EMPLOYEE) {
      throw new ForbiddenException(
        'COMPANY_ADMIN can only manage AGENT or EMPLOYEE accounts',
      );
    }
  }

  private async getScopedUser(id: string, actor: AuthenticatedUser) {
    const user = await this.adminRepository.findUserById(id);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (this.isSuperAdmin(actor)) {
      return user;
    }

    const companyId = this.assertCompanyAdminScope(actor);

    if (user.companyId !== companyId) {
      throw new ForbiddenException('You can only access users of your company');
    }

    this.ensureCompanyAdminCanManageRole(user.role);

    return user;
  }

  private async logAuditEvent(input: {
    actor: AuthenticatedUser;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  }) {
    await this.adminRepository.createAuditLog({
      actorUserId: input.actor.sub,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      details: input.details,
    });
  }

  async getDashboardStats() {
    const [stats, databaseHealth, platformSettings] = await Promise.all([
      this.adminRepository.getDashboardStats(),
      this.adminRepository.checkDatabaseHealth(),
      this.getPlatformSettings(),
    ]);

    const maintenanceMode = Boolean(platformSettings.maintenanceMode);

    return {
      ...stats,
      platform: {
        maintenanceMode,
        databaseConnected: databaseHealth.connected,
        status: maintenanceMode
          ? 'MAINTENANCE'
          : databaseHealth.connected
            ? 'OPERATIONAL'
            : 'DEGRADED',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getMaintenanceHealth() {
    const [stats, databaseHealth, platformSettings] = await Promise.all([
      this.adminRepository.getDashboardStats(),
      this.adminRepository.checkDatabaseHealth(),
      this.getPlatformSettings(),
    ]);

    const maintenanceMode = Boolean(platformSettings.maintenanceMode);

    return {
      status: maintenanceMode
        ? 'MAINTENANCE'
        : databaseHealth.connected
          ? 'OPERATIONAL'
          : 'DEGRADED',
      maintenanceMode,
      database: databaseHealth,
      counters: stats,
      generatedAt: new Date().toISOString(),
    };
  }

  async getPlatformSettings() {
    const row = await this.adminRepository.getPlatformSettings(PLATFORM_SETTINGS_KEY);

    if (!row || !row.value || typeof row.value !== 'object') {
      return this.getDefaultPlatformSettings();
    }

    return {
      ...this.getDefaultPlatformSettings(),
      ...(row.value as Record<string, unknown>),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updatePlatformSettings(
    updatePlatformSettingsDto: UpdatePlatformSettingsDto,
    actor: AuthenticatedUser,
  ) {
    const currentSettings = await this.getPlatformSettings();

    const nextSettings = {
      ...currentSettings,
      ...(updatePlatformSettingsDto.platformName !== undefined
        ? { platformName: updatePlatformSettingsDto.platformName.trim() }
        : {}),
      ...(updatePlatformSettingsDto.supportEmail !== undefined
        ? { supportEmail: updatePlatformSettingsDto.supportEmail?.trim() ?? null }
        : {}),
      ...(updatePlatformSettingsDto.defaultLanguage !== undefined
        ? { defaultLanguage: updatePlatformSettingsDto.defaultLanguage.trim() }
        : {}),
      ...(updatePlatformSettingsDto.defaultCurrency !== undefined
        ? { defaultCurrency: updatePlatformSettingsDto.defaultCurrency.trim() }
        : {}),
      ...(updatePlatformSettingsDto.maintenanceMode !== undefined
        ? { maintenanceMode: updatePlatformSettingsDto.maintenanceMode }
        : {}),
      ...(updatePlatformSettingsDto.allowUserInvitations !== undefined
        ? { allowUserInvitations: updatePlatformSettingsDto.allowUserInvitations }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.adminRepository.upsertPlatformSettings(
      PLATFORM_SETTINGS_KEY,
      nextSettings,
      actor.sub,
    );

    await this.logAuditEvent({
      actor,
      action: 'UPDATE_PLATFORM_SETTINGS',
      entityType: 'Setting',
      entityId: saved.id,
      details: {
        key: PLATFORM_SETTINGS_KEY,
      },
    });

    return {
      message: 'Platform settings updated successfully',
      data: nextSettings,
    };
  }

  async findAllCompanies(query: QueryAdminCompaniesDto) {
    const pagination = this.normalizePagination(query);
    const isActive = this.parseBooleanFilter(query.isActive);
    const status = this.parseCompanyStatus(query.status);

    const where: Prisma.CompanyWhereInput = {
      ...(query.search?.trim()
        ? {
            OR: [
              { name: { contains: query.search.trim(), mode: Prisma.QueryMode.insensitive } },
              {
                legalName: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              { email: { contains: query.search.trim(), mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    };

    return this.adminRepository.findCompanies(where, pagination);
  }

  async createCompany(createCompanyDto: CreateCompanyDto, actor: AuthenticatedUser) {
    try {
      const company = await this.adminRepository.createCompany({
        name: createCompanyDto.name.trim(),
        legalName: createCompanyDto.legalName?.trim() ?? null,
        email: createCompanyDto.email?.trim().toLowerCase() ?? null,
        phone: createCompanyDto.phone?.trim() ?? null,
        website: createCompanyDto.website?.trim() ?? null,
        address: createCompanyDto.address?.trim() ?? null,
        isActive: createCompanyDto.isActive ?? true,
        status: (createCompanyDto.isActive ?? true)
          ? CompanyStatus.ACTIVE
          : CompanyStatus.INACTIVE,
      });

      await this.logAuditEvent({
        actor,
        action: 'CREATE_COMPANY',
        entityType: 'Company',
        entityId: company.id,
      });

      return company;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A company with this name already exists');
      }

      throw error;
    }
  }

  async findCompanyById(id: string) {
    const company = await this.adminRepository.findCompanyById(id);

    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    return company;
  }

  async updateCompany(
    id: string,
    updateCompanyDto: UpdateCompanyDto,
    actor: AuthenticatedUser,
  ) {
    await this.findCompanyById(id);

    const isActive = updateCompanyDto.isActive;

    try {
      const company = await this.adminRepository.updateCompany(id, {
        ...(updateCompanyDto.name !== undefined
          ? { name: updateCompanyDto.name.trim() }
          : {}),
        ...(updateCompanyDto.legalName !== undefined
          ? { legalName: updateCompanyDto.legalName?.trim() ?? null }
          : {}),
        ...(updateCompanyDto.email !== undefined
          ? { email: updateCompanyDto.email?.trim().toLowerCase() ?? null }
          : {}),
        ...(updateCompanyDto.phone !== undefined
          ? { phone: updateCompanyDto.phone?.trim() ?? null }
          : {}),
        ...(updateCompanyDto.website !== undefined
          ? { website: updateCompanyDto.website?.trim() ?? null }
          : {}),
        ...(updateCompanyDto.address !== undefined
          ? { address: updateCompanyDto.address?.trim() ?? null }
          : {}),
        ...(isActive !== undefined
          ? {
              isActive,
              status: isActive ? CompanyStatus.ACTIVE : CompanyStatus.INACTIVE,
            }
          : {}),
      });

      await this.logAuditEvent({
        actor,
        action: 'UPDATE_COMPANY',
        entityType: 'Company',
        entityId: company.id,
      });

      return company;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A company with this name already exists');
      }

      throw error;
    }
  }

  async setCompanyActivation(
    id: string,
    dto: SetCompanyActivationDto,
    actor: AuthenticatedUser,
  ) {
    const company = await this.adminRepository.updateCompany(id, {
      isActive: dto.isActive,
      status: dto.isActive ? CompanyStatus.ACTIVE : CompanyStatus.INACTIVE,
    });

    await this.logAuditEvent({
      actor,
      action: dto.isActive ? 'ACTIVATE_COMPANY' : 'DEACTIVATE_COMPANY',
      entityType: 'Company',
      entityId: company.id,
    });

    return company;
  }

  async removeCompany(id: string, actor: AuthenticatedUser) {
    await this.findCompanyById(id);
    const deleted = await this.adminRepository.removeCompany(id);

    await this.logAuditEvent({
      actor,
      action: 'DELETE_COMPANY',
      entityType: 'Company',
      entityId: deleted.id,
    });

    return {
      message: 'Company deleted successfully',
      data: deleted,
    };
  }

  async findAllSubscriptions(query: QueryAdminSubscriptionsDto) {
    const pagination = this.normalizePagination(query);
    const status = this.parseSubscriptionStatus(query.status);
    const isActive = this.parseBooleanFilter(query.isActive);

    const where: Prisma.SubscriptionWhereInput = {
      ...(query.search?.trim()
        ? {
            OR: [
              {
                plan: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                company: {
                  name: {
                    contains: query.search.trim(),
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.plan ? { plan: query.plan.trim() } : {}),
      ...(status ? { status } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    };

    return this.adminRepository.findSubscriptions(where, pagination);
  }

  async createSubscription(
    createSubscriptionDto: CreateAdminSubscriptionDto,
    actor: AuthenticatedUser,
  ) {
    await this.ensureCompanyExists(createSubscriptionDto.companyId);

    const startDate = new Date(createSubscriptionDto.startDate);
    const endDate = createSubscriptionDto.endDate
      ? new Date(createSubscriptionDto.endDate)
      : null;

    if (endDate && endDate < startDate) {
      throw new BadRequestException('endDate cannot be before startDate');
    }

    const status = createSubscriptionDto.status ?? SubscriptionStatus.ACTIVE;

    const subscription = await this.adminRepository.createSubscription({
      companyId: createSubscriptionDto.companyId,
      plan: createSubscriptionDto.plan.trim(),
      status,
      startDate,
      endDate,
      isActive:
        createSubscriptionDto.isActive ?? status === SubscriptionStatus.ACTIVE,
    });

    await this.logAuditEvent({
      actor,
      action: 'CREATE_SUBSCRIPTION',
      entityType: 'Subscription',
      entityId: subscription.id,
    });

    return subscription;
  }

  async findSubscriptionById(id: string) {
    const subscription = await this.adminRepository.findSubscriptionById(id);

    if (!subscription) {
      throw new NotFoundException(`Subscription with id ${id} not found`);
    }

    return subscription;
  }

  async updateSubscription(
    id: string,
    updateSubscriptionDto: UpdateAdminSubscriptionDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.findSubscriptionById(id);

    if (updateSubscriptionDto.companyId) {
      await this.ensureCompanyExists(updateSubscriptionDto.companyId);
    }

    const nextStartDate = updateSubscriptionDto.startDate
      ? new Date(updateSubscriptionDto.startDate)
      : existing.startDate;
    const nextEndDate =
      updateSubscriptionDto.endDate !== undefined
        ? updateSubscriptionDto.endDate
          ? new Date(updateSubscriptionDto.endDate)
          : null
        : existing.endDate;

    if (nextEndDate && nextEndDate < nextStartDate) {
      throw new BadRequestException('endDate cannot be before startDate');
    }

    const status = updateSubscriptionDto.status ?? existing.status;

    const updated = await this.adminRepository.updateSubscription(id, {
      ...(updateSubscriptionDto.companyId
        ? {
            company: {
              connect: {
                id: updateSubscriptionDto.companyId,
              },
            },
          }
        : {}),
      ...(updateSubscriptionDto.plan !== undefined
        ? { plan: updateSubscriptionDto.plan.trim() }
        : {}),
      ...(updateSubscriptionDto.status !== undefined
        ? { status: updateSubscriptionDto.status }
        : {}),
      ...(updateSubscriptionDto.startDate !== undefined
        ? { startDate: nextStartDate }
        : {}),
      ...(updateSubscriptionDto.endDate !== undefined
        ? { endDate: nextEndDate }
        : {}),
      ...(updateSubscriptionDto.isActive !== undefined
        ? { isActive: updateSubscriptionDto.isActive }
        : status === SubscriptionStatus.ACTIVE
          ? { isActive: true }
          : {}),
    });

    await this.logAuditEvent({
      actor,
      action: 'UPDATE_SUBSCRIPTION',
      entityType: 'Subscription',
      entityId: updated.id,
    });

    return updated;
  }

  async setSubscriptionStatus(
    id: string,
    dto: SetSubscriptionStatusDto,
    actor: AuthenticatedUser,
  ) {
    await this.findSubscriptionById(id);

    const updated = await this.adminRepository.updateSubscription(id, {
      status: dto.status,
      isActive: dto.isActive ?? dto.status === SubscriptionStatus.ACTIVE,
    });

    await this.logAuditEvent({
      actor,
      action: 'UPDATE_SUBSCRIPTION_STATUS',
      entityType: 'Subscription',
      entityId: updated.id,
      details: {
        status: dto.status,
        isActive: dto.isActive,
      },
    });

    return updated;
  }

  async removeSubscription(id: string, actor: AuthenticatedUser) {
    await this.findSubscriptionById(id);
    const deleted = await this.adminRepository.removeSubscription(id);

    await this.logAuditEvent({
      actor,
      action: 'DELETE_SUBSCRIPTION',
      entityType: 'Subscription',
      entityId: deleted.id,
    });

    return {
      message: 'Subscription deleted successfully',
      data: deleted,
    };
  }

  async findAllUsers(query: QueryAdminUsersDto, actor: AuthenticatedUser) {
    const pagination = this.normalizePagination(query);
    const role = this.parseUserRole(query.role);
    const isActive = this.parseBooleanFilter(query.isActive);

    const where: Prisma.UserWhereInput = {
      ...(query.search?.trim()
        ? {
            OR: [
              {
                fullName: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                email: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
      ...(role ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
    };

    if (this.isCompanyAdmin(actor)) {
      const companyId = this.assertCompanyAdminScope(actor);
      where.companyId = companyId;
      where.role = role && role !== UserRole.COMPANY_ADMIN && role !== UserRole.SUPER_ADMIN
        ? role
        : {
            in: [UserRole.AGENT, UserRole.EMPLOYEE],
          };
    }

    return this.adminRepository.findUsers(where, pagination);
  }

  async createUser(createUserDto: CreateAdminUserDto, actor: AuthenticatedUser) {
    const role = createUserDto.role ?? UserRole.AGENT;
    let companyId: string | null = createUserDto.companyId ?? null;

    if (this.isCompanyAdmin(actor)) {
      this.ensureCompanyAdminCanManageRole(role);
      companyId = this.assertCompanyAdminScope(actor);
    } else if (role !== UserRole.SUPER_ADMIN && !companyId) {
      throw new BadRequestException('companyId is required for non-super-admin users');
    }

    if (role === UserRole.SUPER_ADMIN) {
      companyId = null;
    }

    if (companyId) {
      await this.ensureCompanyExists(companyId);
    }

    const firstName = createUserDto.firstName.trim();
    const lastName = createUserDto.lastName?.trim() ?? null;
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    try {
      const user = await this.adminRepository.createUser({
        fullName: fullName || null,
        email: createUserDto.email.trim().toLowerCase(),
        passwordHash: this.hashPassword(createUserDto.password),
        role,
        companyId,
        isActive: true,
      });

      await this.logAuditEvent({
        actor,
        action: 'CREATE_USER',
        entityType: 'User',
        entityId: user.id,
        details: {
          role,
          companyId,
        },
      });

      return user;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists');
      }

      throw error;
    }
  }

  async findUserById(id: string, actor: AuthenticatedUser) {
    return this.getScopedUser(id, actor);
  }

  async updateUser(
    id: string,
    updateUserDto: UpdateAdminUserDto,
    actor: AuthenticatedUser,
  ) {
    const current = await this.getScopedUser(id, actor);

    const requestedRole = updateUserDto.role ?? current.role;
    let nextRole = requestedRole;

    if (this.isCompanyAdmin(actor)) {
      this.ensureCompanyAdminCanManageRole(nextRole);
    }

    let nextCompanyId = current.companyId;

    if (this.isSuperAdmin(actor) && updateUserDto.companyId !== undefined) {
      nextCompanyId = updateUserDto.companyId;
    }

    if (this.isCompanyAdmin(actor)) {
      nextCompanyId = this.assertCompanyAdminScope(actor);
    }

    if (nextRole === UserRole.SUPER_ADMIN) {
      nextCompanyId = null;
    } else if (!nextCompanyId) {
      throw new BadRequestException('companyId is required for non-super-admin users');
    }

    if (nextCompanyId) {
      await this.ensureCompanyExists(nextCompanyId);
    }

    const firstName =
      updateUserDto.firstName !== undefined
        ? updateUserDto.firstName.trim()
        : current.firstName;
    const lastName =
      updateUserDto.lastName !== undefined
        ? updateUserDto.lastName?.trim() ?? null
        : current.lastName;
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    const data: Prisma.UserUpdateInput = {
      ...(updateUserDto.firstName !== undefined || updateUserDto.lastName !== undefined
        ? { fullName: fullName || null }
        : {}),
      ...(updateUserDto.email !== undefined
        ? { email: updateUserDto.email.trim().toLowerCase() }
        : {}),
      ...(updateUserDto.role !== undefined ? { role: nextRole } : {}),
      ...(updateUserDto.isActive !== undefined ? { isActive: updateUserDto.isActive } : {}),
      ...(updateUserDto.password
        ? { passwordHash: this.hashPassword(updateUserDto.password) }
        : {}),
      ...(nextCompanyId === null
        ? {
            company: {
              disconnect: true,
            },
          }
        : {
            company: {
              connect: {
                id: nextCompanyId,
              },
            },
          }),
    };

    try {
      const updated = await this.adminRepository.updateUser(id, data);

      await this.logAuditEvent({
        actor,
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: updated.id,
      });

      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists');
      }

      throw error;
    }
  }

  async setUserActivation(
    id: string,
    dto: SetUserActivationDto,
    actor: AuthenticatedUser,
  ) {
    await this.getScopedUser(id, actor);

    const updated = await this.adminRepository.updateUser(id, {
      isActive: dto.isActive,
    });

    await this.logAuditEvent({
      actor,
      action: dto.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      entityType: 'User',
      entityId: updated.id,
    });

    return updated;
  }

  async removeUser(id: string, actor: AuthenticatedUser) {
    await this.getScopedUser(id, actor);

    const deleted = await this.adminRepository.removeUser(id);

    await this.logAuditEvent({
      actor,
      action: 'DELETE_USER',
      entityType: 'User',
      entityId: deleted.id,
    });

    return {
      message: 'User deleted successfully',
      data: deleted,
    };
  }

  async findMaintenanceAuditLogs(query: QueryMaintenanceAuditLogsDto) {
    const pagination = this.normalizePagination(query);

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action.trim() } : {}),
      ...(query.entityType ? { entityType: query.entityType.trim() } : {}),
      ...(query.userId ? { actorUserId: query.userId } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                action: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                entityType: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                entityId: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    return this.adminRepository.findAuditLogs(where, pagination);
  }
}
