import { UpdateAiPolicyDto } from './update-ai-policy.dto';
import { UpdateBusinessHoursDto } from './update-business-hours.dto';
import { UpdateWhatsappPolicyDto } from './update-whatsapp-policy.dto';

export class UpdateSettingsDto {
  businessHours?: UpdateBusinessHoursDto;
  aiPolicy?: UpdateAiPolicyDto;
  whatsappPolicy?: UpdateWhatsappPolicyDto;
}