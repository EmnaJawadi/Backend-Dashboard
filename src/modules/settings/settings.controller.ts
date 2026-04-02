import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateAiPolicyDto } from './dto/update-ai-policy.dto';
import { UpdateBusinessHoursDto } from './dto/update-business-hours.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateWhatsappPolicyDto } from './dto/update-whatsapp-policy.dto';
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
}