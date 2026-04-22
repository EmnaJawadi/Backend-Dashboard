import { Type } from 'class-transformer';
import {
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

class UpdatePlatformConfigurationDto {
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsBoolean()
  allowInvitations?: boolean;

  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @IsOptional()
  @IsString()
  platformTimezone?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsIn(['open', 'invite_only', 'closed'])
  companySignupPolicy?: 'open' | 'invite_only' | 'closed';

  @IsOptional()
  @IsBoolean()
  manualCompanyValidation?: boolean;
}

class UpdatePlatformSecurityDto {
  @IsOptional()
  @IsBoolean()
  enforceAdmin2fa?: boolean;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  adminSessionDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxLoginAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  lockDurationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  allowPasswordReset?: boolean;

  @IsOptional()
  @IsEmail()
  securityAlertEmail?: string;
}

class UpdatePlatformAiGlobalDto {
  @IsOptional()
  @IsIn(['Google Gemini'])
  provider?: 'Google Gemini';

  @IsOptional()
  @IsIn(['gemini-2.5-flash'])
  model?: 'gemini-2.5-flash';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300000)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32000)
  maxTokens?: number;

  @IsOptional()
  @IsBoolean()
  logsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  maskSensitiveDataInLogs?: boolean;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsBoolean()
  humanFallbackEnabled?: boolean;
}

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePlatformConfigurationDto)
  configuration?: UpdatePlatformConfigurationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePlatformSecurityDto)
  security?: UpdatePlatformSecurityDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePlatformAiGlobalDto)
  aiGlobal?: UpdatePlatformAiGlobalDto;
}
