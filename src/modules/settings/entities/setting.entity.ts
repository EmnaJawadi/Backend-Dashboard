export type IntegrationStatus = 'healthy' | 'warning' | 'error';
export type WhatsAppConnectionStatus = 'connected' | 'disconnected';

export interface BusinessHoursDay {
  day: string;
  start: string;
  end: string;
  active: boolean;
}

export interface CompanyBusinessHours {
  enabled: boolean;
  timezone: string;
  days: BusinessHoursDay[];
  autoReplyOutsideHours: boolean;
  outOfHoursMessage: string;
}

export interface CompanyAiPolicy {
  enabled: boolean;
  handoffEnabled: boolean;
  confidenceThreshold: number;
  escalationDelayMinutes: number;
  responseTone: string;
  language: string;
  botGuidelines: string;
}

export interface CompanyWorkflowPolicy {
  enabled: boolean;
  defaultAssigneeId: string | null;
  defaultAssignment: string;
  welcomeMessage: string;
  preHandoffMessage: string;
  primaryTag: string;
}

export interface CompanyGeneralSettings {
  officialName: string;
  companyName: string;
  displayName: string;
  supportEmail: string;
  supportPhone: string;
  city: string;
  country: string;
  defaultLanguage: string;
  timezone: string;
  emailNotificationsEnabled: boolean;
  emailNotifications: boolean;
  secureMode: boolean;
}

export interface CompanyWhatsappProfile {
  businessPhoneNumber: string;
  displayName: string;
  connectionStatus: WhatsAppConnectionStatus;
  phoneNumberId: string;
  businessAccountId: string;
}

export interface CompanyWhatsappTechnicalSettings {
  webhookUrl: string;
  verifyToken: string;
  verifyWebhookSignature: boolean;
  notificationsEnabled: boolean;
  defaultCountryCode: string;
}

export interface CompanySettingsEntity {
  id: string;
  key: string;
  companyId: string;
  businessHours: CompanyBusinessHours;
  aiPolicy: CompanyAiPolicy;
  workflow: CompanyWorkflowPolicy;
  general: CompanyGeneralSettings;
  whatsappProfile: CompanyWhatsappProfile;
  whatsappTechnicalSettings: CompanyWhatsappTechnicalSettings;
  updatedAt: Date;
}

export interface PlatformConfigurationSettings {
  maintenanceMode: boolean;
  allowInvitations: boolean;
  defaultLanguage: string;
  platformTimezone: string;
  supportEmail: string;
  companySignupPolicy: 'open' | 'invite_only' | 'closed';
  manualCompanyValidation: boolean;
}

export interface PlatformSecuritySettings {
  enforceAdmin2fa: boolean;
  adminSessionDurationMinutes: number;
  maxLoginAttempts: number;
  lockDurationMinutes: number;
  allowPasswordReset: boolean;
  securityAlertEmail: string;
}

export interface PlatformAiGlobalSettings {
  provider: 'Google Gemini';
  model: 'gemini-2.5-flash';
  confidenceThreshold: number;
  timeoutMs: number;
  maxTokens: number;
  logsEnabled: boolean;
  maskSensitiveDataInLogs: boolean;
  systemPrompt: string;
  humanFallbackEnabled: boolean;
}

export interface PlatformSettingsEntity {
  id: string;
  key: string;
  configuration: PlatformConfigurationSettings;
  security: PlatformSecuritySettings;
  aiGlobal: PlatformAiGlobalSettings;
  updatedAt: Date;
}

export interface PlatformIntegrationHealth {
  key:
    | 'backend_api'
    | 'postgresql'
    | 'redis'
    | 'n8n'
    | 'smtp'
    | 'evolution_api'
    | 'gemini_ai'
    | 'file_storage'
    | 'queue_jobs';
  label: string;
  status: IntegrationStatus;
  lastCheck: string;
  message: string;
}

export interface PlatformServiceState {
  key: string;
  label: string;
  status: IntegrationStatus;
  message: string;
}

export interface PlatformSupervisionSnapshot {
  apiLatencyMs: number;
  queueBacklog: number;
  uptimePercent: number;
  globalBotSuccessRate: number;
  recentErrorsCount: number;
  lastCriticalError: string | null;
  services: PlatformServiceState[];
}

export interface PlatformSteeringSnapshot {
  totalCompanies: number;
  activeCompanies: number;
  activeUsers: number;
  activeAgents: number;
  globalConversations: number;
  globalAutomationRate: number;
  globalHandoffRate: number;
  subscriptionsExpiringSoon: number;
  criticalAlerts: number;
}

export interface PlatformAuditLogItem {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
}

export interface PlatformSettingsView {
  settings: PlatformSettingsEntity;
  integrations: PlatformIntegrationHealth[];
  supervision: PlatformSupervisionSnapshot;
  steering: PlatformSteeringSnapshot;
  auditLogs: {
    data: PlatformAuditLogItem[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AgentSettingsSummaryEntity {
  companyId: string;
  companyName: string;
  botEnabled: boolean;
  handoffEnabled: boolean;
  supportHoursEnabled: boolean;
  supportHoursTimezone: string;
  businessHours: BusinessHoursDay[];
  defaultLanguage: string;
  defaultAssignment: string;
}
