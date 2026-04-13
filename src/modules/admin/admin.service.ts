import { Injectable } from '@nestjs/common';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { UsersRepository } from '../users/users.repository';

type PlatformSettings = {
  platformName: string;
  supportEmail: string | null;
  defaultLanguage: string;
  defaultCurrency: string;
  maintenanceMode: boolean;
  allowUserInvitations: boolean;
  updatedAt: Date;
};

@Injectable()
export class AdminService {
  private platformSettings: PlatformSettings = {
    platformName: 'Backend Dashboard',
    supportEmail: null,
    defaultLanguage: 'en',
    defaultCurrency: 'USD',
    maintenanceMode: false,
    allowUserInvitations: true,
    updatedAt: new Date(),
  };

  constructor(
    private readonly usersRepository: UsersRepository,
  ) {}

  getDashboardOverview() {
    const usersResult = this.usersRepository.findMany({});

    const users = usersResult.data;

    return {
      users: {
        total: users.length,
        active: users.filter((user) => user.isActive).length,
        inactive: users.filter((user) => !user.isActive).length,
      },
      platformSettings: this.platformSettings,
    };
  }

  findAllUsers(query: QueryAdminUsersDto) {
    return this.usersRepository.findMany(query);
  }

  getPlatformSettings() {
    return this.platformSettings;
  }

  updatePlatformSettings(
    updatePlatformSettingsDto: UpdatePlatformSettingsDto,
  ) {
    if (updatePlatformSettingsDto.platformName !== undefined) {
      this.platformSettings.platformName =
        updatePlatformSettingsDto.platformName.trim();
    }

    if (updatePlatformSettingsDto.supportEmail !== undefined) {
      this.platformSettings.supportEmail =
        updatePlatformSettingsDto.supportEmail?.trim() ?? null;
    }

    if (updatePlatformSettingsDto.defaultLanguage !== undefined) {
      this.platformSettings.defaultLanguage =
        updatePlatformSettingsDto.defaultLanguage.trim();
    }

    if (updatePlatformSettingsDto.defaultCurrency !== undefined) {
      this.platformSettings.defaultCurrency =
        updatePlatformSettingsDto.defaultCurrency.trim();
    }

    if (updatePlatformSettingsDto.maintenanceMode !== undefined) {
      this.platformSettings.maintenanceMode =
        updatePlatformSettingsDto.maintenanceMode;
    }

    if (updatePlatformSettingsDto.allowUserInvitations !== undefined) {
      this.platformSettings.allowUserInvitations =
        updatePlatformSettingsDto.allowUserInvitations;
    }

    this.platformSettings.updatedAt = new Date();

    return {
      message: 'Platform settings updated successfully',
      data: this.platformSettings,
    };
  }
}
