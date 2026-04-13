import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateAiPolicyDto } from './dto/update-ai-policy.dto';
import { UpdateBusinessHoursDto } from './dto/update-business-hours.dto';
import { UpdateGeneralSettingsDto } from './dto/update-general-settings.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateWhatsappPolicyDto } from './dto/update-whatsapp-policy.dto';
import { UpdateWorkflowPolicyDto } from './dto/update-workflow-policy.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() updateSettingsDto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(updateSettingsDto);
  }

  @Patch('business-hours')
  updateBusinessHours(
    @Body() updateBusinessHoursDto: UpdateBusinessHoursDto,
  ) {
    return this.settingsService.updateBusinessHours(updateBusinessHoursDto);
  }

  @Patch('ai-policy')
  updateAiPolicy(@Body() updateAiPolicyDto: UpdateAiPolicyDto) {
    return this.settingsService.updateAiPolicy(updateAiPolicyDto);
  }

  @Patch('whatsapp-policy')
  updateWhatsappPolicy(
    @Body() updateWhatsappPolicyDto: UpdateWhatsappPolicyDto,
  ) {
    return this.settingsService.updateWhatsappPolicy(updateWhatsappPolicyDto);
  }

  @Patch('workflow')
  updateWorkflowPolicy(
    @Body() updateWorkflowPolicyDto: UpdateWorkflowPolicyDto,
  ) {
    return this.settingsService.updateWorkflowPolicy(updateWorkflowPolicyDto);
  }

  @Patch('general')
  updateGeneralSettings(
    @Body() updateGeneralSettingsDto: UpdateGeneralSettingsDto,
  ) {
    return this.settingsService.updateGeneralSettings(updateGeneralSettingsDto);
  }
}
