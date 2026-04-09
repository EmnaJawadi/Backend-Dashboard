import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { QueryAdminCompaniesDto } from './dto/query-admin-companies.dto';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  getDashboardOverview() {
    return this.adminService.getDashboardOverview();
  }

  @Get('users')
  findAllUsers(@Query() query: QueryAdminUsersDto) {
    return this.adminService.findAllUsers(query);
  }

  @Get('companies')
  findAllCompanies(@Query() query: QueryAdminCompaniesDto) {
    return this.adminService.findAllCompanies(query);
  }

  @Get('platform-settings')
  getPlatformSettings() {
    return this.adminService.getPlatformSettings();
  }

  @Patch('platform-settings')
  updatePlatformSettings(
    @Body() updatePlatformSettingsDto: UpdatePlatformSettingsDto,
  ) {
    return this.adminService.updatePlatformSettings(
      updatePlatformSettingsDto,
    );
  }
}