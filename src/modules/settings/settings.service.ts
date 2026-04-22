import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { QueryPlatformAuditLogsDto } from './dto/query-platform-audit-logs.dto';
import {
  UpdateCompanyAdminSettingsDto,
  UpdateCompanySettingsDto,
} from './dto/update-company-settings.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { SettingsRepository } from './settings.repository';
import type {
  AgentSettingsSummaryEntity,
  BusinessHoursDay,
  CompanySettingsEntity,
  IntegrationStatus,
  PlatformAuditLogItem,
  PlatformIntegrationHealth,
  PlatformServiceState,
  PlatformSettingsView,
  PlatformSteeringSnapshot,
  PlatformSupervisionSnapshot,
} from './entities/setting.entity';

type AuditPagination = {
  page: number;
  limit: number;
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly prisma: PrismaService,
  ) {}

  private mergeBusinessHoursDays(
    currentDays: BusinessHoursDay[],
    incomingDays?: Array<{
      day?: string;
      start?: string;
      end?: string;
      active?: boolean;
    }>,
  ): BusinessHoursDay[] {
    if (!incomingDays || incomingDays.length === 0) {
      return currentDays;
    }

    return incomingDays.map((dayPatch, index) => {
      const current = currentDays[index] ?? {
        day: dayPatch.day ?? `day_${index}`,
        start: '08:00',
        end: '18:00',
        active: true,
      };

      return {
        day: dayPatch.day ?? current.day,
        start: dayPatch.start ?? current.start,
        end: dayPatch.end ?? current.end,
        active: dayPatch.active ?? current.active,
      };
    });
  }

  private normalizeAuditPagination(query: QueryPlatformAuditLogsDto): AuditPagination {
    return {
      page: Math.max(1, Number(query.page ?? 1)),
      limit: Math.min(100, Math.max(1, Number(query.limit ?? 20))),
    };
  }

  private isSuperAdmin(actor: AuthenticatedUser): boolean {
    return actor.role === UserRole.SUPER_ADMIN;
  }

  private assertScopedCompanyId(
    actor: AuthenticatedUser,
    requestedCompanyId?: string,
  ): string {
    if (this.isSuperAdmin(actor)) {
      const superAdminCompanyId = requestedCompanyId ?? actor.companyId ?? undefined;
      if (!superAdminCompanyId) {
        throw new BadRequestException(
          'companyId is required for SUPER_ADMIN on company scoped settings',
        );
      }
      return superAdminCompanyId;
    }

    if (!actor.companyId) {
      throw new ForbiddenException('User is not linked to a company');
    }

    if (requestedCompanyId && requestedCompanyId !== actor.companyId) {
      throw new ForbiddenException(
        'You are not allowed to access settings of another company',
      );
    }

    return actor.companyId;
  }

  private buildCompanySettingsView(
    settings: CompanySettingsEntity,
    includeAdminOnlyFields: boolean,
  ) {
    const base = {
      companyId: settings.companyId,
      updatedAt: settings.updatedAt,
      businessHours: settings.businessHours,
      aiPolicy: {
        enabled: settings.aiPolicy.enabled,
        handoffEnabled: settings.aiPolicy.handoffEnabled,
        confidenceThreshold: settings.aiPolicy.confidenceThreshold,
        escalationDelayMinutes: settings.aiPolicy.escalationDelayMinutes,
        responseTone: settings.aiPolicy.responseTone,
        language: settings.aiPolicy.language,
        botGuidelines: settings.aiPolicy.botGuidelines,
      },
      workflow: {
        enabled: settings.workflow.enabled,
        defaultAssignment: settings.workflow.defaultAssignment,
        welcomeMessage: settings.workflow.welcomeMessage,
        preHandoffMessage: settings.workflow.preHandoffMessage,
      },
      general: {
        companyName: settings.general.companyName,
        supportEmail: settings.general.supportEmail,
        defaultLanguage: settings.general.defaultLanguage,
        timezone: settings.general.timezone,
        emailNotifications: settings.general.emailNotifications,
      },
      whatsappProfile: settings.whatsappProfile,
      readonly: {
        confidenceThreshold: !includeAdminOnlyFields,
      },
    };

    if (!includeAdminOnlyFields) {
      return base;
    }

    return {
      ...base,
      adminOnly: {
        workflow: {
          primaryTag: settings.workflow.primaryTag,
        },
        general: {
          secureMode: settings.general.secureMode,
        },
        whatsappTechnicalSettings: settings.whatsappTechnicalSettings,
      },
    };
  }

  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private asStatus(value: boolean): IntegrationStatus {
    return value ? 'healthy' : 'warning';
  }

  private async buildIntegrationsHealth(): Promise<PlatformIntegrationHealth[]> {
    const now = new Date().toISOString();
    const dbHealthy = await this.checkDatabaseHealth();
    const hasRedis = Boolean(process.env.REDIS_URL);
    const hasN8n = Boolean(process.env.N8N_WEBHOOK_URL);
    const hasSmtp = Boolean(process.env.SMTP_HOST);
    const hasWhatsapp = Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN,
    );
    const hasStorage = Boolean(
      process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT,
    );

    const integrations: PlatformIntegrationHealth[] = [
      {
        key: 'backend_api',
        label: 'Backend API',
        status: 'healthy',
        lastCheck: now,
        message: 'API active',
      },
      {
        key: 'postgresql',
        label: 'PostgreSQL / base de donnees',
        status: dbHealthy ? 'healthy' : 'error',
        lastCheck: now,
        message: dbHealthy ? 'Connexion etablie' : 'Connexion impossible',
      },
      {
        key: 'redis',
        label: 'Redis',
        status: this.asStatus(hasRedis),
        lastCheck: now,
        message: hasRedis ? 'Configuration detectee' : 'REDIS_URL absent',
      },
      {
        key: 'n8n',
        label: 'n8n',
        status: this.asStatus(hasN8n),
        lastCheck: now,
        message: hasN8n ? 'Webhook configure' : 'N8N_WEBHOOK_URL absent',
      },
      {
        key: 'smtp',
        label: 'SMTP',
        status: this.asStatus(hasSmtp),
        lastCheck: now,
        message: hasSmtp ? 'Serveur SMTP configure' : 'SMTP_HOST absent',
      },
      {
        key: 'whatsapp_meta',
        label: 'WhatsApp API / Meta',
        status: this.asStatus(hasWhatsapp),
        lastCheck: now,
        message: hasWhatsapp
          ? 'Token WhatsApp configure'
          : 'Token WhatsApp non configure',
      },
      {
        key: 'file_storage',
        label: 'Stockage fichiers',
        status: this.asStatus(hasStorage),
        lastCheck: now,
        message: hasStorage ? 'Stockage configure' : 'S3/MINIO non configure',
      },
      {
        key: 'queue_jobs',
        label: 'Queue / jobs',
        status: this.asStatus(hasRedis),
        lastCheck: now,
        message: hasRedis ? 'Queue branchee sur Redis' : 'Queue inactive (Redis)',
      },
    ];

    return integrations;
  }

  private async buildSupervisionSnapshot(
    integrations: PlatformIntegrationHealth[],
  ): Promise<PlatformSupervisionSnapshot> {
    const [totalConversations, aiRuns, recentErrors, lastCriticalError, queueBacklog] =
      await Promise.all([
        this.prisma.conversation.count(),
        this.prisma.aiRun.aggregate({
          _count: {
            id: true,
          },
        }),
        this.prisma.auditLog.count({
          where: {
            action: {
              contains: 'ERROR',
              mode: 'insensitive',
            },
          },
        }),
        this.prisma.auditLog.findFirst({
          where: {
            action: {
              contains: 'ERROR',
              mode: 'insensitive',
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            action: true,
            createdAt: true,
          },
        }),
        this.prisma.webhookEvent.count({
          where: {
            OR: [
              { processingStatus: null },
              {
                processingStatus: {
                  in: ['pending', 'retrying', 'failed'],
                },
              },
            ],
          },
        }),
      ]);

    const aiRunCount = aiRuns._count.id;
    const globalBotSuccessRate =
      totalConversations > 0
        ? Math.min(99, Math.max(0, Math.round((aiRunCount / totalConversations) * 100)))
        : 0;

    const degradedServices = integrations.filter(
      (service) => service.status !== 'healthy',
    ).length;

    const serviceStates: PlatformServiceState[] = integrations.map((integration) => ({
      key: integration.key,
      label: integration.label,
      status: integration.status,
      message: integration.message,
    }));

    return {
      apiLatencyMs: degradedServices > 0 ? 320 : 140,
      queueBacklog,
      uptimePercent: degradedServices > 0 ? 97.5 : 99.9,
      globalBotSuccessRate,
      recentErrorsCount: recentErrors,
      lastCriticalError: lastCriticalError
        ? `${lastCriticalError.action ?? 'ERROR'} (${lastCriticalError.createdAt.toISOString()})`
        : null,
      services: serviceStates,
    };
  }

  private async buildSteeringSnapshot(
    criticalAlerts: number,
  ): Promise<PlatformSteeringSnapshot> {
    const now = new Date();
    const plus30Days = new Date(now);
    plus30Days.setDate(plus30Days.getDate() + 30);

    const [
      totalCompanies,
      activeCompanies,
      activeUsers,
      activeAgents,
      globalConversations,
      handoffConversations,
      aiRunsCount,
      subscriptionsExpiringSoon,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({
        where: { isActive: true },
      }),
      this.prisma.user.count({
        where: { isActive: true },
      }),
      this.prisma.user.count({
        where: {
          isActive: true,
          role: {
            in: [UserRole.AGENT, UserRole.EMPLOYEE],
          },
        },
      }),
      this.prisma.conversation.count(),
      this.prisma.conversation.count({
        where: {
          handoffRequired: true,
        },
      }),
      this.prisma.aiRun.count(),
      this.prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: now,
            lte: plus30Days,
          },
        },
      }),
    ]);

    const globalAutomationRate =
      globalConversations > 0
        ? Math.min(100, Math.round((aiRunsCount / globalConversations) * 100))
        : 0;

    const globalHandoffRate =
      globalConversations > 0
        ? Math.min(
            100,
            Math.round((handoffConversations / globalConversations) * 100),
          )
        : 0;

    return {
      totalCompanies,
      activeCompanies,
      activeUsers,
      activeAgents,
      globalConversations,
      globalAutomationRate,
      globalHandoffRate,
      subscriptionsExpiringSoon,
      criticalAlerts,
    };
  }

  private async listPlatformAuditLogs(
    query: QueryPlatformAuditLogsDto,
  ): Promise<PlatformSettingsView['auditLogs']> {
    const pagination = this.normalizeAuditPagination(query);
    const skip = (pagination.page - 1) * pagination.limit;

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    const where = {
      ...(query.action
        ? {
            action: {
              contains: query.action,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(query.entity
        ? {
            entityType: {
              contains: query.entity,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(query.userId ? { actorUserId: query.userId } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pagination.limit,
        select: {
          id: true,
          createdAt: true,
          action: true,
          entityType: true,
          entityId: true,
          actorUserId: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const mapped: PlatformAuditLogItem[] = data.map((item) => ({
      id: item.id,
      createdAt: item.createdAt.toISOString(),
      action: item.action ?? 'UNKNOWN_ACTION',
      entity: item.entityType ?? 'UnknownEntity',
      entityId: item.entityId,
      userId: item.actorUserId,
    }));

    return {
      data: mapped,
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    };
  }

  private async createAuditLog(input: {
    actor: AuthenticatedUser;
    action: string;
    companyId?: string | null;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actor.sub,
        companyId: input.companyId ?? null,
        action: input.action,
        entityType: 'Setting',
        entityId: input.companyId ?? null,
        details: (input.details ?? {}) as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });
  }

  async getPlatformSettings(
    query: QueryPlatformAuditLogsDto,
  ): Promise<PlatformSettingsView> {
    const settings = await this.settingsRepository.getPlatformSettings();
    const integrations = await this.buildIntegrationsHealth();
    const supervision = await this.buildSupervisionSnapshot(integrations);
    const steering = await this.buildSteeringSnapshot(
      supervision.recentErrorsCount +
        integrations.filter((item) => item.status !== 'healthy').length,
    );
    const auditLogs = await this.listPlatformAuditLogs(query);

    return {
      settings,
      integrations,
      supervision,
      steering,
      auditLogs,
    };
  }

  async updatePlatformSettings(
    dto: UpdatePlatformSettingsDto,
    actor: AuthenticatedUser,
  ): Promise<PlatformSettingsView> {
    await this.settingsRepository.updatePlatformSettings(
      {
        ...(dto.configuration ? { configuration: dto.configuration } : {}),
        ...(dto.security ? { security: dto.security } : {}),
        ...(dto.aiGlobal
          ? {
              aiGlobal: {
                ...dto.aiGlobal,
                provider: 'Google Gemini',
                model: 'gemini-2.5-flash',
              },
            }
          : {}),
      },
      actor.sub,
    );

    await this.createAuditLog({
      actor,
      action: 'UPDATE_PLATFORM_SETTINGS',
      details: {
        scope: 'platform',
      },
    });

    return this.getPlatformSettings({});
  }

  async testPlatformIntegration(
    key: PlatformIntegrationHealth['key'],
  ): Promise<PlatformIntegrationHealth> {
    const integrations = await this.buildIntegrationsHealth();
    const found = integrations.find((item) => item.key === key);

    if (!found) {
      throw new BadRequestException(`Unknown integration key: ${key}`);
    }

    return found;
  }

  async getCompanySettings(
    actor: AuthenticatedUser,
    requestedCompanyId?: string,
  ) {
    const companyId = this.assertScopedCompanyId(actor, requestedCompanyId);
    const settings = await this.settingsRepository.getCompanySettings(companyId);

    return this.buildCompanySettingsView(settings, this.isSuperAdmin(actor));
  }

  async updateCompanySettings(
    actor: AuthenticatedUser,
    dto: UpdateCompanySettingsDto,
    requestedCompanyId?: string,
  ) {
    const companyId = this.assertScopedCompanyId(actor, requestedCompanyId);
    const current = await this.settingsRepository.getCompanySettings(companyId);

    const updated = await this.settingsRepository.updateCompanySettings(
      companyId,
      {
        ...(dto.businessHours
          ? {
              businessHours: {
                ...current.businessHours,
                ...dto.businessHours,
                days: this.mergeBusinessHoursDays(
                  current.businessHours.days,
                  dto.businessHours.days,
                ),
              },
            }
          : {}),
        ...(dto.aiPolicy
          ? {
              aiPolicy: {
                ...current.aiPolicy,
                ...dto.aiPolicy,
              },
            }
          : {}),
        ...(dto.workflow
          ? {
              workflow: {
                ...current.workflow,
                ...dto.workflow,
              },
            }
          : {}),
        ...(dto.general
          ? {
              general: {
                ...current.general,
                ...dto.general,
              },
            }
          : {}),
        ...(dto.whatsappProfile
          ? {
              whatsappProfile: {
                ...current.whatsappProfile,
                ...dto.whatsappProfile,
              },
            }
          : {}),
      },
      actor.sub,
    );

    await this.createAuditLog({
      actor,
      action: 'UPDATE_COMPANY_SETTINGS',
      companyId,
      details: {
        scope: 'company',
      },
    });

    return this.buildCompanySettingsView(updated, this.isSuperAdmin(actor));
  }

  async updateCompanyAdminSettings(
    actor: AuthenticatedUser,
    dto: UpdateCompanyAdminSettingsDto,
  ) {
    const current = await this.settingsRepository.getCompanySettings(dto.companyId);
    const updated = await this.settingsRepository.updateCompanySettings(
      dto.companyId,
      {
        ...(dto.aiPolicy
          ? {
              aiPolicy: {
                ...current.aiPolicy,
                ...dto.aiPolicy,
              },
            }
          : {}),
        ...(dto.workflow
          ? {
              workflow: {
                ...current.workflow,
                ...dto.workflow,
              },
            }
          : {}),
        ...(dto.general
          ? {
              general: {
                ...current.general,
                ...dto.general,
              },
            }
          : {}),
        ...(dto.whatsappTechnicalSettings
          ? {
              whatsappTechnicalSettings: {
                ...current.whatsappTechnicalSettings,
                ...dto.whatsappTechnicalSettings,
              },
            }
          : {}),
      },
      actor.sub,
    );

    await this.createAuditLog({
      actor,
      action: 'UPDATE_COMPANY_ADMIN_SETTINGS',
      companyId: dto.companyId,
      details: {
        scope: 'company_admin_only',
      },
    });

    return this.buildCompanySettingsView(updated, true);
  }

  async getAgentSettingsSummary(
    actor: AuthenticatedUser,
    requestedCompanyId?: string,
  ): Promise<AgentSettingsSummaryEntity> {
    const companyId = this.assertScopedCompanyId(actor, requestedCompanyId);
    const settings = await this.settingsRepository.getCompanySettings(companyId);

    return {
      companyId: settings.companyId,
      companyName: settings.general.companyName,
      botEnabled: settings.aiPolicy.enabled,
      handoffEnabled: settings.aiPolicy.handoffEnabled,
      supportHoursEnabled: settings.businessHours.enabled,
      supportHoursTimezone: settings.businessHours.timezone,
      businessHours: settings.businessHours.days,
      defaultLanguage: settings.general.defaultLanguage,
      defaultAssignment: settings.workflow.defaultAssignment,
    };
  }
}
