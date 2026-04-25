import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ApproveCompanyRegistrationRequestDto } from './dto/approve-company-registration-request.dto';
import { CreateCompanyRegistrationRequestDto } from './dto/create-company-registration-request.dto';
import { NeedsMoreInfoCompanyRegistrationRequestDto } from './dto/needs-more-info-company-registration-request.dto';
import { QueryCompanyRegistrationRequestsDto } from './dto/query-company-registration-requests.dto';
import { RejectCompanyRegistrationRequestDto } from './dto/reject-company-registration-request.dto';
import { CompanyRegistrationService } from './company-registration.service';

@Controller()
export class CompanyRegistrationController {
  constructor(
    private readonly companyRegistrationService: CompanyRegistrationService,
  ) {}

  @Post(['public/company-registration', 'api/public/company-registration'])
  @Public()
  createRegistrationRequest(
    @Body() dto: CreateCompanyRegistrationRequestDto,
    @Req() request: Request,
  ) {
    const requestIp =
      request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
      request.ip ??
      null;

    return this.companyRegistrationService.createPublicRequest(dto, {
      requesterIp: requestIp,
    });
  }

  @Get([
    'admin/company-registration-requests',
    'api/admin/company-registration-requests',
  ])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findRequests(@Query() query: QueryCompanyRegistrationRequestsDto) {
    return this.companyRegistrationService.findRequests(query);
  }

  @Get([
    'admin/company-registration-requests/:id',
    'api/admin/company-registration-requests/:id',
  ])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findRequestById(@Param('id') id: string) {
    return this.companyRegistrationService.findRequestById(id);
  }

  @Patch([
    'admin/company-registration-requests/:id/approve',
    'api/admin/company-registration-requests/:id/approve',
  ])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  approveRequest(
    @Param('id') id: string,
    @Body() dto: ApproveCompanyRegistrationRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.companyRegistrationService.approveRequest(id, dto, actor);
  }

  @Patch([
    'admin/company-registration-requests/:id/reject',
    'api/admin/company-registration-requests/:id/reject',
  ])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  rejectRequest(
    @Param('id') id: string,
    @Body() dto: RejectCompanyRegistrationRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.companyRegistrationService.rejectRequest(id, dto, actor);
  }

  @Patch([
    'admin/company-registration-requests/:id/needs-more-info',
    'api/admin/company-registration-requests/:id/needs-more-info',
  ])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  requestMoreInfo(
    @Param('id') id: string,
    @Body() dto: NeedsMoreInfoCompanyRegistrationRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.companyRegistrationService.requestMoreInfo(id, dto, actor);
  }
}
