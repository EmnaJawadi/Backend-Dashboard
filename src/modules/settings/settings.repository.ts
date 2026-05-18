import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type {
  CompanySettingsEntity,
  PlatformSettingsEntity,
} from './entities/setting.entity';

type CompanySummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  emailNotificationsEnabled: boolean;
};

type SettingRow = {
  id: string;
  key: string;
  value: unknown;
  updatedAt: Date;
};

@Injectable()
export class SettingsRepository {
  private static readonly PLATFORM_SETTINGS_KEY = 'platform_settings_v2';
  private static readonly LEGACY_SETTINGS_KEY = 'dashboard_settings_v1';
  private static readonly COMPANY_SETTINGS_KEY_PREFIX = 'company_settings_v2';

  constructor(private readonly prisma: PrismaService) {}

  private companySettingsKey(companyId: string): string {
    return `${SettingsRepository.COMPANY_SETTINGS_KEY_PREFIX}:${companyId}`;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private parseBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private parseNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return fallback;
  }

  private parseString(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    return fallback;
  }

  private buildDefaultCompanySettings(company: CompanySummary): CompanySettingsEntity {
    return {
      id: 'company-settings-default',
      key: this.companySettingsKey(company.id),
      companyId: company.id,
      businessHours: {
        enabled: true,
        timezone: 'Africa/Lagos',
        autoReplyOutsideHours: true,
        outOfHoursMessage:
          'Merci pour votre message. Notre equipe vous repondra des la prochaine ouverture.',
        days: [
          { day: 'monday', start: '08:00', end: '18:00', active: true },
          { day: 'tuesday', start: '08:00', end: '18:00', active: true },
          { day: 'wednesday', start: '08:00', end: '18:00', active: true },
          { day: 'thursday', start: '08:00', end: '18:00', active: true },
          { day: 'friday', start: '08:00', end: '18:00', active: true },
          { day: 'saturday', start: '09:00', end: '13:00', active: true },
          { day: 'sunday', start: '09:00', end: '13:00', active: false },
        ],
      },
      aiPolicy: {
        enabled: true,
        handoffEnabled: true,
        confidenceThreshold: 0.75,
        escalationDelayMinutes: 5,
        responseTone: 'professional',
        language: 'fr',
        botGuidelines:
          "Reponds de maniere claire, concise et professionnelle. Si la demande necessite une verification complementaire, informer le client que l'equipe traitera sa demande rapidement, sans annoncer explicitement un transfert technique.",
      },
      workflow: {
        enabled: true,
        defaultAssigneeId: null,
        defaultAssignment: '',
        welcomeMessage:
          'Bonjour. Merci de nous avoir contactes sur WhatsApp. Notre assistant analyse votre demande et vous repond immediatement.',
        preHandoffMessage:
          "Nous avons bien recu votre demande. Elle necessite une verification complementaire et notre equipe vous repondra des que possible.",
        primaryTag: 'SupportWhatsApp',
      },
      general: {
        officialName: company.name,
        companyName: company.name,
        displayName: company.name,
        supportEmail: company.email ?? '',
        supportPhone: company.phone ?? '',
        city: '',
        country: '',
        defaultLanguage: 'fr',
        timezone: 'Africa/Lagos',
        emailNotificationsEnabled: company.emailNotificationsEnabled,
        emailNotifications: company.emailNotificationsEnabled,
        secureMode: true,
      },
      whatsappProfile: {
        businessPhoneNumber: '',
        displayName: company.name,
        connectionStatus: 'disconnected',
        phoneNumberId: '',
        businessAccountId: '',
      },
      whatsappTechnicalSettings: {
        webhookUrl: 'https://api.my-platform.com/webhooks/whatsapp',
        verifyToken: 'support-whatsapp-token',
        verifyWebhookSignature: true,
        notificationsEnabled: true,
        defaultCountryCode: '+234',
      },
      updatedAt: new Date(),
    };
  }

  private buildDefaultPlatformSettings(): PlatformSettingsEntity {
    return {
      id: 'platform-settings-default',
      key: SettingsRepository.PLATFORM_SETTINGS_KEY,
      configuration: {
        maintenanceMode: false,
        allowInvitations: true,
        defaultLanguage: 'fr',
        platformTimezone: 'Africa/Lagos',
        supportEmail: 'support@platform.local',
        companySignupPolicy: 'open',
        manualCompanyValidation: true,
      },
      security: {
        enforceAdmin2fa: true,
        adminSessionDurationMinutes: 480,
        maxLoginAttempts: 5,
        lockDurationMinutes: 30,
        allowPasswordReset: true,
        securityAlertEmail: 'security@platform.local',
      },
      aiGlobal: {
        provider: 'Google Gemini',
        model: 'gemini-2.5-flash',
        confidenceThreshold: 0.75,
        timeoutMs: 45000,
        maxTokens: 1024,
        logsEnabled: true,
        maskSensitiveDataInLogs: true,
        systemPrompt:
          'Tu es l assistant WhatsApp global de la plateforme. Priorise la clarte, la securite et l escalade humaine en cas de doute.',
        humanFallbackEnabled: true,
      },
      updatedAt: new Date(),
    };
  }

  private normalizeBusinessHoursDays(
    value: unknown,
    defaults: CompanySettingsEntity['businessHours']['days'],
  ): CompanySettingsEntity['businessHours']['days'] {
    if (!Array.isArray(value)) {
      return defaults;
    }

    return value
      .map((item, index) => {
        const currentDefault = defaults[index] ?? defaults[0];
        const row = this.asRecord(item);

        return {
          day: this.parseString(row.day, currentDefault.day),
          start: this.parseString(row.start, currentDefault.start),
          end: this.parseString(row.end, currentDefault.end),
          active: this.parseBoolean(row.active, currentDefault.active),
        };
      })
      .filter((item) => item.day.length > 0);
  }

  private toCompanyEntity(
    row: SettingRow,
    company: CompanySummary,
  ): CompanySettingsEntity {
    const defaults = this.buildDefaultCompanySettings(company);
    const value = this.asRecord(row.value);

    const businessHoursRaw = this.asRecord(value.businessHours);
    const aiRaw = this.asRecord(value.aiPolicy);
    const workflowRaw = this.asRecord(value.workflow);
    const generalRaw = this.asRecord(value.general);
    const profileRaw = this.asRecord(value.whatsappProfile);
    const technicalRaw = this.asRecord(value.whatsappTechnicalSettings);

    // Legacy payload compatibility from dashboard_settings_v1.
    const legacyWhatsappRaw = this.asRecord(value.whatsappPolicy);

    return {
      ...defaults,
      id: row.id,
      key: row.key,
      updatedAt: row.updatedAt,
      businessHours: {
        ...defaults.businessHours,
        enabled: this.parseBoolean(
          businessHoursRaw.enabled,
          defaults.businessHours.enabled,
        ),
        timezone: this.parseString(
          businessHoursRaw.timezone,
          defaults.businessHours.timezone,
        ),
        autoReplyOutsideHours: this.parseBoolean(
          businessHoursRaw.autoReplyOutsideHours,
          defaults.businessHours.autoReplyOutsideHours,
        ),
        outOfHoursMessage: this.parseString(
          businessHoursRaw.outOfHoursMessage,
          defaults.businessHours.outOfHoursMessage,
        ),
        days: this.normalizeBusinessHoursDays(
          businessHoursRaw.days,
          defaults.businessHours.days,
        ),
      },
      aiPolicy: {
        ...defaults.aiPolicy,
        enabled: this.parseBoolean(aiRaw.enabled, defaults.aiPolicy.enabled),
        handoffEnabled: this.parseBoolean(
          aiRaw.handoffEnabled,
          defaults.aiPolicy.handoffEnabled,
        ),
        confidenceThreshold: this.parseNumber(
          aiRaw.confidenceThreshold,
          defaults.aiPolicy.confidenceThreshold,
        ),
        escalationDelayMinutes: this.parseNumber(
          aiRaw.escalationDelayMinutes,
          defaults.aiPolicy.escalationDelayMinutes,
        ),
        responseTone: this.parseString(
          aiRaw.responseTone,
          defaults.aiPolicy.responseTone,
        ),
        language: this.parseString(aiRaw.language, defaults.aiPolicy.language),
        botGuidelines: this.parseString(
          aiRaw.botGuidelines ?? aiRaw.systemInstruction,
          defaults.aiPolicy.botGuidelines,
        ),
      },
      workflow: {
        ...defaults.workflow,
        enabled: this.parseBoolean(
          workflowRaw.enabled,
          defaults.workflow.enabled,
        ),
        defaultAssignment: this.parseString(
          workflowRaw.defaultAssignment ?? workflowRaw.defaultAgent,
          defaults.workflow.defaultAssignment,
        ),
        defaultAssigneeId:
          this.parseString(
            workflowRaw.defaultAssigneeId,
            defaults.workflow.defaultAssigneeId ?? '',
          ) || null,
        welcomeMessage: this.parseString(
          workflowRaw.welcomeMessage,
          defaults.workflow.welcomeMessage,
        ),
        preHandoffMessage: this.parseString(
          workflowRaw.preHandoffMessage,
          defaults.workflow.preHandoffMessage,
        ),
        primaryTag: this.parseString(
          workflowRaw.primaryTag,
          defaults.workflow.primaryTag,
        ),
      },
      general: {
        ...defaults.general,
        officialName: this.parseString(
          generalRaw.officialName ?? generalRaw.companyName,
          company.name,
        ),
        companyName: this.parseString(
          generalRaw.officialName ?? generalRaw.companyName,
          company.name,
        ),
        displayName: this.parseString(
          generalRaw.displayName,
          defaults.general.displayName,
        ),
        supportEmail: this.parseString(
          generalRaw.supportEmail,
          defaults.general.supportEmail,
        ),
        supportPhone: this.parseString(
          generalRaw.supportPhone,
          defaults.general.supportPhone,
        ),
        city: this.parseString(generalRaw.city, defaults.general.city),
        country: this.parseString(
          generalRaw.country,
          defaults.general.country,
        ),
        defaultLanguage: this.parseString(
          generalRaw.defaultLanguage,
          defaults.general.defaultLanguage,
        ),
        timezone: this.parseString(generalRaw.timezone, defaults.general.timezone),
        emailNotificationsEnabled: this.parseBoolean(
          generalRaw.emailNotificationsEnabled ?? generalRaw.emailNotifications,
          company.emailNotificationsEnabled,
        ),
        emailNotifications: this.parseBoolean(
          generalRaw.emailNotificationsEnabled ?? generalRaw.emailNotifications,
          company.emailNotificationsEnabled,
        ),
        secureMode: this.parseBoolean(
          generalRaw.secureMode,
          defaults.general.secureMode,
        ),
      },
      whatsappProfile: {
        ...defaults.whatsappProfile,
        businessPhoneNumber: this.parseString(
          profileRaw.businessPhoneNumber ?? legacyWhatsappRaw.businessPhoneNumber,
          defaults.whatsappProfile.businessPhoneNumber,
        ),
        displayName: this.parseString(
          profileRaw.displayName ?? legacyWhatsappRaw.displayName,
          defaults.whatsappProfile.displayName,
        ),
        connectionStatus: this.parseString(
          profileRaw.connectionStatus ?? legacyWhatsappRaw.connectionStatus,
          defaults.whatsappProfile.connectionStatus,
        ) as CompanySettingsEntity['whatsappProfile']['connectionStatus'],
        phoneNumberId: this.parseString(
          profileRaw.phoneNumberId ?? legacyWhatsappRaw.phoneNumberId,
          defaults.whatsappProfile.phoneNumberId,
        ),
        businessAccountId: this.parseString(
          profileRaw.businessAccountId ?? legacyWhatsappRaw.businessAccountId,
          defaults.whatsappProfile.businessAccountId,
        ),
      },
      whatsappTechnicalSettings: {
        ...defaults.whatsappTechnicalSettings,
        webhookUrl: this.parseString(
          technicalRaw.webhookUrl ?? legacyWhatsappRaw.webhookUrl,
          defaults.whatsappTechnicalSettings.webhookUrl,
        ),
        verifyToken: this.parseString(
          technicalRaw.verifyToken ?? legacyWhatsappRaw.verifyToken,
          defaults.whatsappTechnicalSettings.verifyToken,
        ),
        verifyWebhookSignature: this.parseBoolean(
          technicalRaw.verifyWebhookSignature ??
            legacyWhatsappRaw.verifyWebhookSignature,
          defaults.whatsappTechnicalSettings.verifyWebhookSignature,
        ),
        notificationsEnabled: this.parseBoolean(
          technicalRaw.notificationsEnabled ??
            legacyWhatsappRaw.notificationsEnabled,
          defaults.whatsappTechnicalSettings.notificationsEnabled,
        ),
        defaultCountryCode: this.parseString(
          technicalRaw.defaultCountryCode ??
            legacyWhatsappRaw.defaultCountryCode,
          defaults.whatsappTechnicalSettings.defaultCountryCode,
        ),
      },
    };
  }

  private toPlatformEntity(row: SettingRow): PlatformSettingsEntity {
    const defaults = this.buildDefaultPlatformSettings();
    const value = this.asRecord(row.value);
    const configuration = this.asRecord(value.configuration);
    const security = this.asRecord(value.security);
    const aiGlobal = this.asRecord(value.aiGlobal);

    return {
      ...defaults,
      id: row.id,
      key: row.key,
      updatedAt: row.updatedAt,
      configuration: {
        ...defaults.configuration,
        maintenanceMode: this.parseBoolean(
          configuration.maintenanceMode,
          defaults.configuration.maintenanceMode,
        ),
        allowInvitations: this.parseBoolean(
          configuration.allowInvitations,
          defaults.configuration.allowInvitations,
        ),
        defaultLanguage: this.parseString(
          configuration.defaultLanguage,
          defaults.configuration.defaultLanguage,
        ),
        platformTimezone: this.parseString(
          configuration.platformTimezone,
          defaults.configuration.platformTimezone,
        ),
        supportEmail: this.parseString(
          configuration.supportEmail,
          defaults.configuration.supportEmail,
        ),
        companySignupPolicy: this.parseString(
          configuration.companySignupPolicy,
          defaults.configuration.companySignupPolicy,
        ) as PlatformSettingsEntity['configuration']['companySignupPolicy'],
        manualCompanyValidation: this.parseBoolean(
          configuration.manualCompanyValidation,
          defaults.configuration.manualCompanyValidation,
        ),
      },
      security: {
        ...defaults.security,
        enforceAdmin2fa: this.parseBoolean(
          security.enforceAdmin2fa,
          defaults.security.enforceAdmin2fa,
        ),
        adminSessionDurationMinutes: this.parseNumber(
          security.adminSessionDurationMinutes,
          defaults.security.adminSessionDurationMinutes,
        ),
        maxLoginAttempts: this.parseNumber(
          security.maxLoginAttempts,
          defaults.security.maxLoginAttempts,
        ),
        lockDurationMinutes: this.parseNumber(
          security.lockDurationMinutes,
          defaults.security.lockDurationMinutes,
        ),
        allowPasswordReset: this.parseBoolean(
          security.allowPasswordReset,
          defaults.security.allowPasswordReset,
        ),
        securityAlertEmail: this.parseString(
          security.securityAlertEmail,
          defaults.security.securityAlertEmail,
        ),
      },
      aiGlobal: {
        ...defaults.aiGlobal,
        provider: 'Google Gemini',
        model: 'gemini-2.5-flash',
        confidenceThreshold: this.parseNumber(
          aiGlobal.confidenceThreshold,
          defaults.aiGlobal.confidenceThreshold,
        ),
        timeoutMs: this.parseNumber(aiGlobal.timeoutMs, defaults.aiGlobal.timeoutMs),
        maxTokens: this.parseNumber(
          aiGlobal.maxTokens,
          defaults.aiGlobal.maxTokens,
        ),
        logsEnabled: this.parseBoolean(
          aiGlobal.logsEnabled,
          defaults.aiGlobal.logsEnabled,
        ),
        maskSensitiveDataInLogs: this.parseBoolean(
          aiGlobal.maskSensitiveDataInLogs,
          defaults.aiGlobal.maskSensitiveDataInLogs,
        ),
        systemPrompt: this.parseString(
          aiGlobal.systemPrompt,
          defaults.aiGlobal.systemPrompt,
        ),
        humanFallbackEnabled: this.parseBoolean(
          aiGlobal.humanFallbackEnabled,
          defaults.aiGlobal.humanFallbackEnabled,
        ),
      },
    };
  }

  async findCompanySummary(companyId: string): Promise<CompanySummary | null> {
    return this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        emailNotificationsEnabled: true,
      },
    });
  }

  async getPlatformSettings(): Promise<PlatformSettingsEntity> {
    const defaults = this.buildDefaultPlatformSettings();
    const row = await this.prisma.setting.upsert({
      where: { key: SettingsRepository.PLATFORM_SETTINGS_KEY },
      create: {
        key: SettingsRepository.PLATFORM_SETTINGS_KEY,
        description: 'Platform settings payload',
        value: defaults as unknown as Prisma.InputJsonValue,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {},
    });

    return this.toPlatformEntity(row);
  }

  async updatePlatformSettings(
    partial: {
      configuration?: Partial<PlatformSettingsEntity['configuration']>;
      security?: Partial<PlatformSettingsEntity['security']>;
      aiGlobal?: Partial<PlatformSettingsEntity['aiGlobal']>;
    },
    updatedBy?: string,
  ): Promise<PlatformSettingsEntity> {
    const current = await this.getPlatformSettings();
    const merged: PlatformSettingsEntity = {
      ...current,
      ...partial,
      configuration: {
        ...current.configuration,
        ...(partial.configuration ?? {}),
      },
      security: {
        ...current.security,
        ...(partial.security ?? {}),
      },
      aiGlobal: {
        ...current.aiGlobal,
        ...(partial.aiGlobal ?? {}),
        provider: 'Google Gemini',
        model: 'gemini-2.5-flash',
      },
      updatedAt: new Date(),
    };

    const row = await this.prisma.setting.upsert({
      where: { key: SettingsRepository.PLATFORM_SETTINGS_KEY },
      create: {
        key: SettingsRepository.PLATFORM_SETTINGS_KEY,
        description: 'Platform settings payload',
        updatedBy: updatedBy ?? null,
        value: merged as unknown as Prisma.InputJsonValue,
        createdAt: new Date(),
        updatedAt: merged.updatedAt,
      },
      update: {
        value: merged as unknown as Prisma.InputJsonValue,
        updatedBy: updatedBy ?? null,
        updatedAt: merged.updatedAt,
      },
    });

    return this.toPlatformEntity(row);
  }

  async getCompanySettings(companyId: string): Promise<CompanySettingsEntity> {
    const company = await this.findCompanySummary(companyId);

    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found`);
    }

    const key = this.companySettingsKey(companyId);
    const existingRow = await this.prisma.setting.findUnique({
      where: { key },
    });

    if (existingRow) {
      return this.toCompanyEntity(existingRow, company);
    }

    const legacy = await this.prisma.setting.findUnique({
      where: { key: SettingsRepository.LEGACY_SETTINGS_KEY },
    });

    const seeded = legacy
      ? this.toCompanyEntity(
          {
            id: legacy.id,
            key,
            value: legacy.value,
            updatedAt: legacy.updatedAt,
          },
          company,
        )
      : this.buildDefaultCompanySettings(company);

    const created = await this.prisma.setting.create({
      data: {
        key,
        companyId,
        description: 'Company settings payload',
        value: seeded as unknown as Prisma.InputJsonValue,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return this.toCompanyEntity(created, company);
  }

  async updateCompanySettings(
    companyId: string,
    partial: {
      businessHours?: Partial<CompanySettingsEntity['businessHours']>;
      aiPolicy?: Partial<CompanySettingsEntity['aiPolicy']>;
      workflow?: Partial<CompanySettingsEntity['workflow']>;
      general?: Partial<CompanySettingsEntity['general']>;
      whatsappProfile?: Partial<CompanySettingsEntity['whatsappProfile']>;
      whatsappTechnicalSettings?: Partial<
        CompanySettingsEntity['whatsappTechnicalSettings']
      >;
    },
    updatedBy?: string,
  ): Promise<CompanySettingsEntity> {
    const current = await this.getCompanySettings(companyId);
    const merged: CompanySettingsEntity = {
      ...current,
      ...partial,
      businessHours: {
        ...current.businessHours,
        ...(partial.businessHours ?? {}),
      },
      aiPolicy: {
        ...current.aiPolicy,
        ...(partial.aiPolicy ?? {}),
      },
      workflow: {
        ...current.workflow,
        ...(partial.workflow ?? {}),
      },
      general: {
        ...current.general,
        ...(partial.general ?? {}),
      },
      whatsappProfile: {
        ...current.whatsappProfile,
        ...(partial.whatsappProfile ?? {}),
      },
      whatsappTechnicalSettings: {
        ...current.whatsappTechnicalSettings,
        ...(partial.whatsappTechnicalSettings ?? {}),
      },
      updatedAt: new Date(),
    };

    const row = await this.prisma.setting.upsert({
      where: { key: this.companySettingsKey(companyId) },
      create: {
        key: this.companySettingsKey(companyId),
        companyId,
        description: 'Company settings payload',
        value: merged as unknown as Prisma.InputJsonValue,
        updatedBy: updatedBy ?? null,
        createdAt: new Date(),
        updatedAt: merged.updatedAt,
      },
      update: {
        value: merged as unknown as Prisma.InputJsonValue,
        updatedBy: updatedBy ?? null,
        updatedAt: merged.updatedAt,
      },
    });

    const officialName =
      partial.general?.officialName?.trim() || partial.general?.companyName?.trim();
    if (officialName) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: { name: officialName },
      });
    }

    const emailNotificationsEnabled =
      partial.general?.emailNotificationsEnabled ?? partial.general?.emailNotifications;
    if (emailNotificationsEnabled !== undefined) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: { emailNotificationsEnabled },
      });
    }

    const company = await this.findCompanySummary(companyId);
    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found`);
    }

    return this.toCompanyEntity(row, company);
  }
}
