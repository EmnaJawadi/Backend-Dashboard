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
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

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
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  autoReplyOutsideHours?: boolean;

  @IsOptional()
  @IsString()
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
  responseTone?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  botGuidelines?: string;
}

class UpdateCompanyWorkflowDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  defaultAssignment?: string;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  preHandoffMessage?: string;
}

class UpdateCompanyGeneralDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

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
