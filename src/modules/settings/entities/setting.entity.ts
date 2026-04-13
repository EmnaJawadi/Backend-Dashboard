export interface BusinessHoursDay {
  day: string;
  start: string;
  end: string;
  active: boolean;
}

export interface BusinessHours {
  enabled: boolean;
  timezone: string;
  days: BusinessHoursDay[];
  autoReplyOutsideHours: boolean;
  outOfHoursMessage: string;
}

export interface AiPolicy {
  enabled: boolean;
  handoffEnabled: boolean;
  confidenceThreshold: number;
  handoffThreshold: number;
  escalationDelayMinutes: number;
  responseTone: string;
  language: string;
  systemInstruction: string;
}

export type WhatsAppConnectionStatus = 'connected' | 'disconnected';

export interface WhatsappPolicy {
  businessPhoneNumber: string;
  displayName: string;
  webhookUrl: string;
  verifyToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  notificationsEnabled: boolean;
  connectionStatus: WhatsAppConnectionStatus;
  sessionWindowHours: number;
  allowTemplatesOutsideWindow: boolean;
  defaultCountryCode: string;
  verifyWebhookSignature: boolean;
}

export interface WorkflowPolicy {
  enabled: boolean;
  primaryTag: string;
  defaultAgent: string;
  welcomeMessage: string;
  preHandoffMessage: string;
}

export interface GeneralSettings {
  companyName: string;
  supportEmail: string;
  defaultLanguage: string;
  timezone: string;
  emailNotifications: boolean;
  secureMode: boolean;
}

export class SettingEntity {
  id!: string;
  businessHours!: BusinessHours;
  aiPolicy!: AiPolicy;
  whatsappPolicy!: WhatsappPolicy;
  workflow!: WorkflowPolicy;
  general!: GeneralSettings;
  updatedAt!: Date;

  constructor(partial: Partial<SettingEntity>) {
    Object.assign(this, partial);
  }
}
