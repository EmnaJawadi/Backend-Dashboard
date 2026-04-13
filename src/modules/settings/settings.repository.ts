import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SettingEntity } from './entities/setting.entity';

@Injectable()
export class SettingsRepository {
  private static readonly SETTINGS_KEY = 'dashboard_settings_v1';

  constructor(private readonly prisma: PrismaService) {}

  private buildDefaultSettings(): SettingEntity {
    return new SettingEntity({
      id: 'default-settings',
      businessHours: {
        enabled: true,
        timezone: 'Africa/Tunis',
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
        handoffThreshold: 0.45,
        escalationDelayMinutes: 5,
        responseTone: 'Professionnel',
        language: 'Francais',
        systemInstruction:
          'Reponds de maniere claire, concise et professionnelle. Si la demande est complexe, propose un transfert vers un agent humain.',
      },
      whatsappPolicy: {
        businessPhoneNumber: '+216 70 000 000',
        displayName: 'Support Brand',
        webhookUrl: 'https://api.my-platform.com/webhooks/whatsapp',
        verifyToken: 'support-whatsapp-token',
        phoneNumberId: '572001245879001',
        businessAccountId: '104550889210022',
        notificationsEnabled: true,
        connectionStatus: 'connected',
        sessionWindowHours: 24,
        allowTemplatesOutsideWindow: true,
        defaultCountryCode: '+216',
        verifyWebhookSignature: true,
      },
      workflow: {
        enabled: true,
        primaryTag: 'SupportWhatsApp',
        defaultAgent: 'Equipe Support',
        welcomeMessage:
          'Bonjour. Merci de nous avoir contactes sur WhatsApp. Notre assistant analyse votre demande et vous repond immediatement.',
        preHandoffMessage:
          'Votre demande necessite une verification complementaire. Un agent humain va prendre le relais.',
      },
      general: {
        companyName: 'My Support Company',
        supportEmail: 'support@company.com',
        defaultLanguage: 'Francais',
        timezone: 'Africa/Tunis',
        emailNotifications: true,
        secureMode: true,
      },
      updatedAt: new Date(),
    });
  }

  private toEntity(row: {
    id: string;
    value: unknown;
    updatedAt: Date;
  }): SettingEntity {
    const defaults = this.buildDefaultSettings();
    const value = (row.value ?? {}) as Partial<SettingEntity>;

    return new SettingEntity({
      ...defaults,
      ...value,
      id: typeof value.id === 'string' ? value.id : defaults.id,
      businessHours: {
        ...defaults.businessHours,
        ...(value.businessHours ?? {}),
        days:
          value.businessHours?.days?.length
            ? value.businessHours.days
            : defaults.businessHours.days,
      },
      aiPolicy: {
        ...defaults.aiPolicy,
        ...(value.aiPolicy ?? {}),
      },
      whatsappPolicy: {
        ...defaults.whatsappPolicy,
        ...(value.whatsappPolicy ?? {}),
      },
      workflow: {
        ...defaults.workflow,
        ...(value.workflow ?? {}),
      },
      general: {
        ...defaults.general,
        ...(value.general ?? {}),
      },
      updatedAt: row.updatedAt,
    });
  }

  async get(): Promise<SettingEntity> {
    const defaults = this.buildDefaultSettings();

    const row = await this.prisma.setting.upsert({
      where: { key: SettingsRepository.SETTINGS_KEY },
      create: {
        key: SettingsRepository.SETTINGS_KEY,
        description: 'Dashboard settings payload',
        value: defaults as unknown as object,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {},
    });

    return this.toEntity(row);
  }

  async update(partial: Partial<SettingEntity>): Promise<SettingEntity> {
    const current = await this.get();

    const merged = new SettingEntity({
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
      whatsappPolicy: {
        ...current.whatsappPolicy,
        ...(partial.whatsappPolicy ?? {}),
      },
      workflow: {
        ...current.workflow,
        ...(partial.workflow ?? {}),
      },
      general: {
        ...current.general,
        ...(partial.general ?? {}),
      },
      updatedAt: new Date(),
    });

    const row = await this.prisma.setting.upsert({
      where: { key: SettingsRepository.SETTINGS_KEY },
      create: {
        key: SettingsRepository.SETTINGS_KEY,
        description: 'Dashboard settings payload',
        value: merged as unknown as object,
        createdAt: new Date(),
        updatedAt: merged.updatedAt,
      },
      update: {
        value: merged as unknown as object,
        updatedAt: merged.updatedAt,
      },
    });

    return this.toEntity(row);
  }
}
