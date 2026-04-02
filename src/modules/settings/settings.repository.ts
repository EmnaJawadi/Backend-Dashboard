import { Injectable } from '@nestjs/common';
import { SettingEntity } from './entities/setting.entity';

@Injectable()
export class SettingsRepository {
  private settings: SettingEntity = new SettingEntity({
    id: 'default-settings',
    businessHours: {
      enabled: true,
      timezone: 'Africa/Tunis',
      days: [
        { day: 'monday', start: '08:00', end: '18:00', active: true },
        { day: 'tuesday', start: '08:00', end: '18:00', active: true },
        { day: 'wednesday', start: '08:00', end: '18:00', active: true },
        { day: 'thursday', start: '08:00', end: '18:00', active: true },
        { day: 'friday', start: '08:00', end: '18:00', active: true },
        { day: 'saturday', start: '09:00', end: '13:00', active: false },
        { day: 'sunday', start: '09:00', end: '13:00', active: false },
      ],
    },
    aiPolicy: {
      enabled: true,
      autoReply: true,
      confidenceThreshold: 0.75,
      handoffThreshold: 0.45,
      maxRetries: 2,
    },
    whatsappPolicy: {
      sessionWindowHours: 24,
      allowTemplatesOutsideWindow: true,
      defaultCountryCode: '+216',
      verifyWebhookSignature: false,
    },
    updatedAt: new Date(),
  });

  get(): SettingEntity {
    return this.settings;
  }

  update(partial: Partial<SettingEntity>): SettingEntity {
    this.settings = new SettingEntity({
      ...this.settings,
      ...partial,
      updatedAt: new Date(),
    });

    return this.settings;
  }
}