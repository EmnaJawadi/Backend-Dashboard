import { Body, Controller, Get, Post } from '@nestjs/common';
import { CompanyInfoDto } from './dto/company-info.dto';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { SetupCompanyDto } from './dto/setup-company.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  getStatus() {
    return this.onboardingService.getStatus();
  }

  @Get('company-info')
  getCompanyInfo(): CompanyInfoDto {
    return this.onboardingService.getCompanyInfo();
  }

  @Get('team-members')
  getTeamMembers() {
    return this.onboardingService.getTeamMembers();
  }

  @Post('setup-company')
  setupCompany(@Body() setupCompanyDto: SetupCompanyDto) {
    return this.onboardingService.setupCompany(setupCompanyDto);
  }

  @Post('team-members')
  addTeamMember(@Body() createTeamMemberDto: CreateTeamMemberDto) {
    return this.onboardingService.addTeamMember(createTeamMemberDto);
  }
}