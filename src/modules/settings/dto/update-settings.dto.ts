import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UpdateAiPolicyDto } from './update-ai-policy.dto';
import { UpdateBusinessHoursDto } from './update-business-hours.dto';
import { UpdateGeneralSettingsDto } from './update-general-settings.dto';
import { UpdateWhatsappPolicyDto } from './update-whatsapp-policy.dto';
import { UpdateWorkflowPolicyDto } from './update-workflow-policy.dto';

export class UpdateSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBusinessHoursDto)
  businessHours?: UpdateBusinessHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAiPolicyDto)
  aiPolicy?: UpdateAiPolicyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateWhatsappPolicyDto)
  whatsappPolicy?: UpdateWhatsappPolicyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateWorkflowPolicyDto)
  workflow?: UpdateWorkflowPolicyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGeneralSettingsDto)
  general?: UpdateGeneralSettingsDto;
}
