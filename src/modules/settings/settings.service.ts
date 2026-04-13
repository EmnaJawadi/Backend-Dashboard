import { Injectable } from '@nestjs/common';
import { SettingsRepository } from './settings.repository';
import { UpdateAiPolicyDto } from './dto/update-ai-policy.dto';
import { UpdateBusinessHoursDto } from './dto/update-business-hours.dto';
import { UpdateGeneralSettingsDto } from './dto/update-general-settings.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateWhatsappPolicyDto } from './dto/update-whatsapp-policy.dto';
import { UpdateWorkflowPolicyDto } from './dto/update-workflow-policy.dto';
import { BusinessHoursDay } from './entities/setting.entity';

@Injectable()
export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  private mergeBusinessHoursDays(
    currentDays: BusinessHoursDay[],
    incomingDays?: UpdateBusinessHoursDto['days'],
  ): BusinessHoursDay[] {
    if (!incomingDays || incomingDays.length === 0) {
      return currentDays;
    }

    return incomingDays.map((dayPatch, index) => {
      const current = currentDays[index] ?? {
        day: dayPatch.day ?? `day_${index}`,
        start: '08:00',
        end: '18:00',
        active: true,
      };

      return {
        day: dayPatch.day ?? current.day,
        start: dayPatch.start ?? current.start,
        end: dayPatch.end ?? current.end,
        active: dayPatch.active ?? current.active,
      };
    });
  }

  async getSettings() {
    return this.settingsRepository.get();
  }

  async updateSettings(updateSettingsDto: UpdateSettingsDto) {
    const current = await this.settingsRepository.get();

    return this.settingsRepository.update({
      businessHours: updateSettingsDto.businessHours
        ? {
            ...current.businessHours,
            ...updateSettingsDto.businessHours,
            days: this.mergeBusinessHoursDays(
              current.businessHours.days,
              updateSettingsDto.businessHours.days,
            ),
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
      workflow: updateSettingsDto.workflow
        ? {
            ...current.workflow,
            ...updateSettingsDto.workflow,
          }
        : current.workflow,
      general: updateSettingsDto.general
        ? {
            ...current.general,
            ...updateSettingsDto.general,
          }
        : current.general,
    });
  }

  async updateBusinessHours(updateBusinessHoursDto: UpdateBusinessHoursDto) {
    const current = await this.settingsRepository.get();

    return this.settingsRepository.update({
      businessHours: {
        ...current.businessHours,
        ...updateBusinessHoursDto,
        days: this.mergeBusinessHoursDays(
          current.businessHours.days,
          updateBusinessHoursDto.days,
        ),
      },
    });
  }

  async updateAiPolicy(updateAiPolicyDto: UpdateAiPolicyDto) {
    const current = await this.settingsRepository.get();

    return this.settingsRepository.update({
      aiPolicy: {
        ...current.aiPolicy,
        ...updateAiPolicyDto,
      },
    });
  }

  async updateWhatsappPolicy(updateWhatsappPolicyDto: UpdateWhatsappPolicyDto) {
    const current = await this.settingsRepository.get();

    return this.settingsRepository.update({
      whatsappPolicy: {
        ...current.whatsappPolicy,
        ...updateWhatsappPolicyDto,
      },
    });
  }

  async updateWorkflowPolicy(updateWorkflowPolicyDto: UpdateWorkflowPolicyDto) {
    const current = await this.settingsRepository.get();

    return this.settingsRepository.update({
      workflow: {
        ...current.workflow,
        ...updateWorkflowPolicyDto,
      },
    });
  }

  async updateGeneralSettings(updateGeneralSettingsDto: UpdateGeneralSettingsDto) {
    const current = await this.settingsRepository.get();

    return this.settingsRepository.update({
      general: {
        ...current.general,
        ...updateGeneralSettingsDto,
      },
    });
  }
}
