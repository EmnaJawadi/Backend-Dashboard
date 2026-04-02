import { Injectable } from '@nestjs/common';
import { SettingsRepository } from './settings.repository';
import { UpdateAiPolicyDto } from './dto/update-ai-policy.dto';
import { UpdateBusinessHoursDto } from './dto/update-business-hours.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateWhatsappPolicyDto } from './dto/update-whatsapp-policy.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  getSettings() {
    return this.settingsRepository.get();
  }

  updateSettings(updateSettingsDto: UpdateSettingsDto) {
    const current = this.settingsRepository.get();

    return this.settingsRepository.update({
      businessHours: updateSettingsDto.businessHours
        ? {
            ...current.businessHours,
            ...updateSettingsDto.businessHours,
          }
        : current.businessHours,
      aiPolicy: updateSettingsDto.aiPolicy
        ? {
            ...current.aiPolicy,
            ...updateSettingsDto.aiPolicy,
          }
        : current.aiPolicy,
      whatsappPolicy: updateSettingsDto.whatsappPolicy
        ? {
            ...current.whatsappPolicy,
            ...updateSettingsDto.whatsappPolicy,
          }
        : current.whatsappPolicy,
    });
  }

  updateBusinessHours(updateBusinessHoursDto: UpdateBusinessHoursDto) {
    const current = this.settingsRepository.get();

    return this.settingsRepository.update({
      businessHours: {
        ...current.businessHours,
        ...updateBusinessHoursDto,
      },
    });
  }

  updateAiPolicy(updateAiPolicyDto: UpdateAiPolicyDto) {
    const current = this.settingsRepository.get();

    return this.settingsRepository.update({
      aiPolicy: {
        ...current.aiPolicy,
        ...updateAiPolicyDto,
      },
    });
  }

  updateWhatsappPolicy(updateWhatsappPolicyDto: UpdateWhatsappPolicyDto) {
    const current = this.settingsRepository.get();

    return this.settingsRepository.update({
      whatsappPolicy: {
        ...current.whatsappPolicy,
        ...updateWhatsappPolicyDto,
      },
    });
  }
}