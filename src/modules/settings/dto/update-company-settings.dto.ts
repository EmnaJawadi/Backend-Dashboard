import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const COMPANY_LANGUAGE_VALUES = ['fr', 'en', 'ar'] as const;
export const COMPANY_RESPONSE_TONE_VALUES = [
  'professional',
  'friendly',
  'formal',
  'concise',
] as const;

class UpdateCompanyBusinessHoursDayDto {
  @IsOptional()
  @IsString()
  day?: string;

  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsString()
  end?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateCompanyBusinessHoursDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  autoReplyOutsideHours?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  outOfHoursMessage?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCompanyBusinessHoursDayDto)
  days?: UpdateCompanyBusinessHoursDayDto[];
}

class UpdateCompanyAiPolicyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  handoffEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  escalationDelayMinutes?: number;

  @IsOptional()
  @IsString()
  @IsIn(COMPANY_RESPONSE_TONE_VALUES)
  responseTone?: string;

  @IsOptional()
  @IsString()
  @IsIn(COMPANY_LANGUAGE_VALUES)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  botGuidelines?: string;
}

class UpdateCompanyWorkflowDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @IsUUID()
  defaultAssigneeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultAssignment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  preHandoffMessage?: string;
}

class UpdateCompanyGeneralDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  officialName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  supportPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @IsIn(COMPANY_LANGUAGE_VALUES)
  defaultLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  emailNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}

class UpdateCompanyWhatsappProfileDto {
  @IsOptional()
  @IsString()
  businessPhoneNumber?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  businessAccountId?: string;

  @IsOptional()
  @IsIn(['connected', 'disconnected'])
  connectionStatus?: 'connected' | 'disconnected';
}

export class UpdateCompanySettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyBusinessHoursDto)
  businessHours?: UpdateCompanyBusinessHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyAiPolicyDto)
  aiPolicy?: UpdateCompanyAiPolicyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyWorkflowDto)
  workflow?: UpdateCompanyWorkflowDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyGeneralDto)
  general?: UpdateCompanyGeneralDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyWhatsappProfileDto)
  whatsappProfile?: UpdateCompanyWhatsappProfileDto;
}

class UpdateCompanyAdminAiPolicyDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceThreshold?: number;
}

class UpdateCompanyAdminWorkflowDto {
  @IsOptional()
  @IsString()
  primaryTag?: string;
}

class UpdateCompanyAdminGeneralDto {
  @IsOptional()
  @IsBoolean()
  secureMode?: boolean;
}

class UpdateCompanyWhatsappTechnicalDto {
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  verifyToken?: string;

  @IsOptional()
  @IsBoolean()
  verifyWebhookSignature?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsString()
  defaultCountryCode?: string;
}

export class UpdateCompanyAdminSettingsDto {
  @IsString()
  companyId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyAdminAiPolicyDto)
  aiPolicy?: UpdateCompanyAdminAiPolicyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyAdminWorkflowDto)
  workflow?: UpdateCompanyAdminWorkflowDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyAdminGeneralDto)
  general?: UpdateCompanyAdminGeneralDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyWhatsappTechnicalDto)
  whatsappTechnicalSettings?: UpdateCompanyWhatsappTechnicalDto;
}

export class UpdateCompanyPreferencesDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  officialName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  supportPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @IsIn(COMPANY_LANGUAGE_VALUES)
  defaultLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  emailNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}

export class UpdateCompanyAiSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  handoffEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  escalationDelayMinutes?: number;

  @IsOptional()
  @IsString()
  @IsIn(COMPANY_RESPONSE_TONE_VALUES)
  responseTone?: string;

  @IsOptional()
  @IsString()
  @IsIn(COMPANY_LANGUAGE_VALUES)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  botGuidelines?: string;
}

export class UpdateCompanyWorkflowSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsUUID()
  defaultAssigneeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  verificationMessage?: string;
}
