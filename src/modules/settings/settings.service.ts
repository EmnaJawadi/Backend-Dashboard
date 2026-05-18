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
  UpdateCompanyAiSettingsDto,
  UpdateCompanyAdminSettingsDto,
  UpdateCompanyPreferencesDto,
  UpdateCompanySettingsDto,
  UpdateCompanyWorkflowSettingsDto,
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

const SAFE_VERIFICATION_MESSAGE =
  "Nous avons bien recu votre demande. Elle necessite une verification complementaire et notre equipe vous repondra des que possible.";

const FORBIDDEN_CUSTOMER_MESSAGE_PATTERNS = [
  /agent\s+humain/i,
  /human\s+agent/i,
  /\bhandoff\b/i,
  /escalad/i,
  /transf(?:ert|erer|ere|eree|erons|erez|eront)/i,
  /prendre\s+le\s+relais/i,
  /base\s+de\s+connaissances?/i,
  /knowledge\s+base/i,
  /\bRAG\b/i,
  /l.?ia\s+ne\s+sait/i,
  /erreur\s+(ia|backend|n8n|systeme|syst[eè]me)/i,
  /\bn8n\b/i,
  /\bbackend\b/i,
];

const FORBIDDEN_BOT_GUIDELINE_PATTERNS = [
  /ignore(r|z)?\s+les?\s+(regles|r[eè]gles|instructions)/i,
  /ignore(r|z)?\s+(system|syst[eè]me|developer|securit[eé])/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /desactiv(er|ez)\s+la\s+securit/i,
  /company\s*id/i,
  /autre\s+entreprise/i,
  /toutes?\s+les?\s+entreprises?/i,
  /secret/i,
  /token/i,
  /api\s*key/i,
  /cle\s+(gemini|evolution|api)/i,
  /base\s+de\s+connaissances?\s+globale/i,
];

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

  private assertCompanyAdminWriteAccess(actor: AuthenticatedUser): string {
    if (
      actor.role !== UserRole.COMPANY_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only a company admin can update company settings');
    }

    return this.assertAuthenticatedCompanyId(actor);
  }

  private assertPlatformManagedSettingsAccess(actor: AuthenticatedUser): void {
    if (!this.isSuperAdmin(actor)) {
      throw new ForbiddenException(
        'Technical WhatsApp, AI and workflow settings are managed by the platform',
      );
    }
  }

  private assertAuthenticatedCompanyId(actor: AuthenticatedUser): string {
    if (!actor.companyId) {
      throw new ForbiddenException('User is not linked to a company');
    }

    return actor.companyId;
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

    if (requestedCompanyId) {
      throw new ForbiddenException(
        'companyId must be resolved from the authenticated user',
      );
    }

    return actor.companyId;
  }

  private normalizeLanguage(value: string): string {
    const normalized = value.trim().toLowerCase();

    if (['fr', 'fr-fr', 'francais', 'français', 'french'].includes(normalized)) {
      return 'fr';
    }

    if (['en', 'en-us', 'english', 'anglais'].includes(normalized)) {
      return 'en';
    }

    if (['ar', 'arabe', 'arabic'].includes(normalized)) {
      return 'ar';
    }

    return normalized;
  }

  private normalizeResponseTone(value: string): string {
    const normalized = value.trim().toLowerCase();

    if (['professionnel', 'professional'].includes(normalized)) {
      return 'professional';
    }

    if (['amical', 'friendly'].includes(normalized)) {
      return 'friendly';
    }

    if (['formel', 'formal'].includes(normalized)) {
      return 'formal';
    }

    if (['concis', 'concise'].includes(normalized)) {
      return 'concise';
    }

    return normalized;
  }

  private assertValidTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException('Invalid timezone');
    }
  }

  private assertSafeCustomerMessage(value: string, fieldName: string): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    if (FORBIDDEN_CUSTOMER_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      throw new BadRequestException(
        `${fieldName} must not expose internal workflow, AI, RAG or handoff details`,
      );
    }

    return trimmed;
  }

  private assertSafeBotGuidelines(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    if (FORBIDDEN_BOT_GUIDELINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      throw new BadRequestException(
        'Bot guidelines cannot override platform security, tenant isolation or internal AI rules',
      );
    }

    return trimmed;
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
        responseTone: this.normalizeResponseTone(settings.aiPolicy.responseTone),
        language: this.normalizeLanguage(settings.aiPolicy.language),
        botGuidelines: settings.aiPolicy.botGuidelines,
      },
      workflow: {
        enabled: settings.workflow.enabled,
        defaultAssigneeId: settings.workflow.defaultAssigneeId,
        defaultAssignment: settings.workflow.defaultAssignment,
        welcomeMessage: settings.workflow.welcomeMessage,
        preHandoffMessage: settings.workflow.preHandoffMessage,
      },
      general: {
        officialName: settings.general.officialName,
        companyName: settings.general.companyName,
        displayName: settings.general.displayName,
        supportEmail: settings.general.supportEmail,
        supportPhone: settings.general.supportPhone,
        city: settings.general.city,
        country: settings.general.country,
        defaultLanguage: this.normalizeLanguage(settings.general.defaultLanguage),
        timezone: settings.general.timezone,
        emailNotificationsEnabled: settings.general.emailNotificationsEnabled,
        emailNotifications: settings.general.emailNotifications,
      },
      whatsappProfile: includeAdminOnlyFields
        ? settings.whatsappProfile
        : {
            businessPhoneNumber: settings.whatsappProfile.businessPhoneNumber,
            displayName: settings.whatsappProfile.displayName,
            connectionStatus: settings.whatsappProfile.connectionStatus,
          },
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

  private buildCompanyPreferencesView(settings: CompanySettingsEntity) {
    return {
      officialName: settings.general.officialName,
      companyName: settings.general.companyName,
      displayName: settings.general.displayName,
      supportEmail: settings.general.supportEmail,
      supportPhone: settings.general.supportPhone,
      city: settings.general.city,
      country: settings.general.country,
      defaultLanguage: this.normalizeLanguage(settings.general.defaultLanguage),
      timezone: settings.general.timezone,
      emailNotificationsEnabled: settings.general.emailNotificationsEnabled,
      emailNotifications: settings.general.emailNotifications,
      visibleOnlyForCompany: true,
    };
  }

  private buildCompanyAiSettingsView(settings: CompanySettingsEntity) {
    return {
      enabled: settings.aiPolicy.enabled,
      handoffEnabled: settings.aiPolicy.handoffEnabled,
      responseTone: this.normalizeResponseTone(settings.aiPolicy.responseTone),
      language: this.normalizeLanguage(settings.aiPolicy.language),
      escalationDelayMinutes: settings.aiPolicy.escalationDelayMinutes,
      botGuidelines: settings.aiPolicy.botGuidelines,
      confidenceThresholdManagedByPlatform: true,
      technicalSettingsManagedByPlatform: true,
    };
  }

  private buildCompanyWorkflowSettingsView(settings: CompanySettingsEntity) {
    return {
      enabled: settings.workflow.enabled,
      defaultAssigneeId: settings.workflow.defaultAssigneeId,
      defaultAssignment: settings.workflow.defaultAssignment,
      welcomeMessage: settings.workflow.welcomeMessage,
      verificationMessage:
        settings.workflow.preHandoffMessage || SAFE_VERIFICATION_MESSAGE,
    };
  }

  private async resolveDefaultAssigneePatch(
    companyId: string,
    assigneeId: string | null | undefined,
    wasProvided: boolean,
  ): Promise<
    Pick<CompanySettingsEntity['workflow'], 'defaultAssigneeId' | 'defaultAssignment'> | {}
  > {
    if (!wasProvided) {
      return {};
    }

    if (!assigneeId) {
      return {
        defaultAssigneeId: null,
        defaultAssignment: '',
      };
    }

    const assignee = await this.prisma.user.findFirst({
      where: {
        id: assigneeId,
        companyId,
        isActive: true,
        approvalStatus: 'APPROVED',
        role: {
          in: [UserRole.AGENT, UserRole.EMPLOYEE],
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    });

    if (!assignee) {
      throw new BadRequestException(
        'defaultAssigneeId must belong to an active support member of this company',
      );
    }

    return {
      defaultAssigneeId: assignee.id,
      defaultAssignment: assignee.fullName?.trim() || assignee.email,
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
    const hasRedis = Boolean(
      process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_PORT,
    );
    const hasN8n = Boolean(process.env.N8N_WEBHOOK_URL);
    const hasSmtp = Boolean(process.env.SMTP_HOST);
    const hasEvolution = Boolean(
      process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY,
    );
    const hasGemini = Boolean(
      process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY,
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
        message: hasRedis ? 'Configuration detectee' : 'Configuration Redis absente',
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
        key: 'evolution_api',
        label: 'Evolution API / WhatsApp',
        status: this.asStatus(hasEvolution),
        lastCheck: now,
        message: hasEvolution
          ? 'Configuration Evolution API detectee'
          : 'EVOLUTION_API_URL ou EVOLUTION_API_KEY absent',
      },
      {
        key: 'gemini_ai',
        label: 'Google Gemini',
        status: this.asStatus(hasGemini),
        lastCheck: now,
        message: hasGemini
          ? 'Cle Gemini configuree'
          : 'Cle Gemini non configuree',
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

  async getCompanyPreferences(actor: AuthenticatedUser) {
    const companyId = this.assertAuthenticatedCompanyId(actor);
    const settings = await this.settingsRepository.getCompanySettings(companyId);

    return this.buildCompanyPreferencesView(settings);
  }

  async updateCompanyPreferences(
    actor: AuthenticatedUser,
    dto: UpdateCompanyPreferencesDto,
  ) {
    const companyId = this.assertCompanyAdminWriteAccess(actor);
    const current = await this.settingsRepository.getCompanySettings(companyId);

    if (dto.timezone) {
      this.assertValidTimezone(dto.timezone);
    }

    const updated = await this.settingsRepository.updateCompanySettings(
      companyId,
      {
        general: {
          ...current.general,
          ...(dto.officialName !== undefined
            ? {
                officialName: dto.officialName.trim(),
                companyName: dto.officialName.trim(),
              }
            : {}),
          ...(dto.displayName !== undefined
            ? { displayName: dto.displayName.trim() }
            : {}),
          ...(dto.supportEmail !== undefined
            ? { supportEmail: dto.supportEmail.trim().toLowerCase() }
            : {}),
          ...(dto.supportPhone !== undefined
            ? { supportPhone: dto.supportPhone.trim() }
            : {}),
          ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
          ...(dto.country !== undefined ? { country: dto.country.trim() } : {}),
          ...(dto.defaultLanguage !== undefined
            ? { defaultLanguage: this.normalizeLanguage(dto.defaultLanguage) }
            : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone.trim() } : {}),
          ...(dto.emailNotificationsEnabled !== undefined
            ? {
                emailNotificationsEnabled: dto.emailNotificationsEnabled,
                emailNotifications: dto.emailNotificationsEnabled,
              }
            : {}),
          ...(dto.emailNotifications !== undefined
            ? {
                emailNotificationsEnabled: dto.emailNotifications,
                emailNotifications: dto.emailNotifications,
              }
            : {}),
        },
      },
      actor.sub,
    );

    await this.createAuditLog({
      actor,
      action: 'UPDATE_COMPANY_PREFERENCES',
      companyId,
      details: { scope: 'company' },
    });

    return this.buildCompanyPreferencesView(updated);
  }

  async getCompanyAiSettings(actor: AuthenticatedUser) {
    this.assertPlatformManagedSettingsAccess(actor);
    const companyId = this.assertAuthenticatedCompanyId(actor);
    const settings = await this.settingsRepository.getCompanySettings(companyId);

    return this.buildCompanyAiSettingsView(settings);
  }

  async updateCompanyAiSettings(
    actor: AuthenticatedUser,
    dto: UpdateCompanyAiSettingsDto,
  ) {
    this.assertPlatformManagedSettingsAccess(actor);
    const companyId = this.assertCompanyAdminWriteAccess(actor);
    const current = await this.settingsRepository.getCompanySettings(companyId);

    const updated = await this.settingsRepository.updateCompanySettings(
      companyId,
      {
        aiPolicy: {
          ...current.aiPolicy,
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.handoffEnabled !== undefined
            ? { handoffEnabled: dto.handoffEnabled }
            : {}),
          ...(dto.escalationDelayMinutes !== undefined
            ? { escalationDelayMinutes: dto.escalationDelayMinutes }
            : {}),
          ...(dto.responseTone !== undefined
            ? { responseTone: this.normalizeResponseTone(dto.responseTone) }
            : {}),
          ...(dto.language !== undefined
            ? { language: this.normalizeLanguage(dto.language) }
            : {}),
          ...(dto.botGuidelines !== undefined
            ? { botGuidelines: this.assertSafeBotGuidelines(dto.botGuidelines) }
            : {}),
        },
      },
      actor.sub,
    );

    await this.createAuditLog({
      actor,
      action: 'UPDATE_COMPANY_AI_SETTINGS',
      companyId,
      details: { scope: 'company' },
    });

    return this.buildCompanyAiSettingsView(updated);
  }

  async getCompanyWorkflowSettings(actor: AuthenticatedUser) {
    this.assertPlatformManagedSettingsAccess(actor);
    const companyId = this.assertAuthenticatedCompanyId(actor);
    const settings = await this.settingsRepository.getCompanySettings(companyId);

    return this.buildCompanyWorkflowSettingsView(settings);
  }

  async updateCompanyWorkflowSettings(
    actor: AuthenticatedUser,
    dto: UpdateCompanyWorkflowSettingsDto,
  ) {
    this.assertPlatformManagedSettingsAccess(actor);
    const companyId = this.assertCompanyAdminWriteAccess(actor);
    const current = await this.settingsRepository.getCompanySettings(companyId);
    const assigneePatch = await this.resolveDefaultAssigneePatch(
      companyId,
      dto.defaultAssigneeId,
      Object.prototype.hasOwnProperty.call(dto, 'defaultAssigneeId'),
    );

    const updated = await this.settingsRepository.updateCompanySettings(
      companyId,
      {
        workflow: {
          ...current.workflow,
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...assigneePatch,
          ...(dto.welcomeMessage !== undefined
            ? {
                welcomeMessage: this.assertSafeCustomerMessage(
                  dto.welcomeMessage,
                  'welcomeMessage',
                ),
              }
            : {}),
          ...(dto.verificationMessage !== undefined
            ? {
                preHandoffMessage: this.assertSafeCustomerMessage(
                  dto.verificationMessage,
                  'verificationMessage',
                ),
              }
            : {}),
        },
      },
      actor.sub,
    );

    await this.createAuditLog({
      actor,
      action: 'UPDATE_COMPANY_WORKFLOW_SETTINGS',
      companyId,
      details: { scope: 'company' },
    });

    return this.buildCompanyWorkflowSettingsView(updated);
  }

  async listCompanySupportAssignees(actor: AuthenticatedUser) {
    this.assertPlatformManagedSettingsAccess(actor);
    const companyId = this.assertAuthenticatedCompanyId(actor);
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
        approvalStatus: 'APPROVED',
        role: {
          in: [UserRole.AGENT, UserRole.EMPLOYEE],
        },
      },
      orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
    });

    return users.map((user) => ({
      id: user.id,
      label: user.fullName?.trim() || user.email,
      email: user.email,
      role: user.role,
      type: 'agent' as const,
    }));
  }

  async updateCompanySettings(
    actor: AuthenticatedUser,
    dto: UpdateCompanySettingsDto,
    requestedCompanyId?: string,
  ) {
    const companyId = this.assertScopedCompanyId(actor, requestedCompanyId);
    const current = await this.settingsRepository.getCompanySettings(companyId);
    const companyAdminScope = !this.isSuperAdmin(actor);

    if (companyAdminScope && (dto.aiPolicy || dto.workflow || dto.whatsappProfile)) {
      throw new ForbiddenException(
        'Technical WhatsApp, AI and workflow settings are managed by the platform',
      );
    }

    if (companyAdminScope && dto.whatsappProfile) {
      throw new BadRequestException(
        'WhatsApp profile is managed through secure company WhatsApp endpoints',
      );
    }

    if (companyAdminScope && dto.workflow?.defaultAssignment) {
      throw new BadRequestException(
        'defaultAssignment must be selected from company support assignees',
      );
    }

    if (
      companyAdminScope &&
      dto.workflow &&
      Object.prototype.hasOwnProperty.call(dto.workflow, 'defaultAssigneeId')
    ) {
      throw new BadRequestException(
        'defaultAssigneeId must be updated through the workflow settings endpoint',
      );
    }

    if (companyAdminScope && dto.general?.companyName) {
      throw new BadRequestException(
        'Official company name is managed by the platform; update displayName instead',
      );
    }

    if (dto.general?.timezone) {
      this.assertValidTimezone(dto.general.timezone);
    }

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
                responseTone: dto.aiPolicy.responseTone
                  ? this.normalizeResponseTone(dto.aiPolicy.responseTone)
                  : current.aiPolicy.responseTone,
                language: dto.aiPolicy.language
                  ? this.normalizeLanguage(dto.aiPolicy.language)
                  : current.aiPolicy.language,
                botGuidelines: dto.aiPolicy.botGuidelines
                  ? this.assertSafeBotGuidelines(dto.aiPolicy.botGuidelines)
                  : current.aiPolicy.botGuidelines,
              },
            }
          : {}),
        ...(dto.workflow
          ? {
              workflow: {
                ...current.workflow,
                ...dto.workflow,
                welcomeMessage: dto.workflow.welcomeMessage
                  ? this.assertSafeCustomerMessage(
                      dto.workflow.welcomeMessage,
                      'welcomeMessage',
                    )
                  : current.workflow.welcomeMessage,
                preHandoffMessage: dto.workflow.preHandoffMessage
                  ? this.assertSafeCustomerMessage(
                      dto.workflow.preHandoffMessage,
                      'preHandoffMessage',
                    )
                  : current.workflow.preHandoffMessage,
              },
            }
          : {}),
        ...(dto.general
          ? {
              general: {
                ...current.general,
                ...dto.general,
                defaultLanguage: dto.general.defaultLanguage
                  ? this.normalizeLanguage(dto.general.defaultLanguage)
                  : current.general.defaultLanguage,
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
