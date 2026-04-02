export interface BusinessHours {
  enabled: boolean;
  timezone: string;
  days: Array<{
    day: string;
    start: string;
    end: string;
    active: boolean;
  }>;
}

export interface AiPolicy {
  enabled: boolean;
  autoReply: boolean;
  confidenceThreshold: number;
  handoffThreshold: number;
  maxRetries: number;
}

export interface WhatsappPolicy {
  sessionWindowHours: number;
  allowTemplatesOutsideWindow: boolean;
  defaultCountryCode: string;
  verifyWebhookSignature: boolean;
}

export class SettingEntity {
  id!: string;
  businessHours!: BusinessHours;
  aiPolicy!: AiPolicy;
  whatsappPolicy!: WhatsappPolicy;
  updatedAt!: Date;

  constructor(partial: Partial<SettingEntity>) {
    Object.assign(this, partial);
  }
}