import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ConnectCompanyWhatsappDto } from './dto/connect-company-whatsapp.dto';
import { CreateCompanyApiDto } from './dto/create-company-api.dto';
import { ResolveEvolutionCompanyDto } from './dto/resolve-evolution-company.dto';
import { UpdateCompanyApiDto } from './dto/update-company-api.dto';
import { CompaniesService } from './companies.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post(['companies', 'api/companies'])
  @Roles(UserRole.SUPER_ADMIN)
  create(
    @Body() dto: CreateCompanyApiDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    void actor;
    return this.companiesService.create(dto);
  }

  @Get(['companies', 'api/companies'])
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.companiesService.findAll(actor);
  }

  @Get(['companies/:id', 'api/companies/:id'])
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.companiesService.findOne(id, actor);
  }

  @Patch(['companies/:id', 'api/companies/:id'])
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyApiDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, dto, actor);
  }

  @Post([
    'companies/:id/whatsapp/connect',
    'api/companies/:id/whatsapp/connect',
  ])
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  connectWhatsapp(
    @Param('id') id: string,
    @Body() dto: ConnectCompanyWhatsappDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.companiesService.connectWhatsapp(id, dto, actor);
  }

  @Get([
    'companies/:id/whatsapp/status',
    'api/companies/:id/whatsapp/status',
  ])
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  getWhatsappStatus(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.companiesService.getWhatsappStatus(id, actor);
  }

  @Post([
    'companies/:id/whatsapp/disconnect',
    'api/companies/:id/whatsapp/disconnect',
  ])
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  disconnectWhatsapp(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.companiesService.disconnectWhatsapp(id, actor);
  }
}

@Controller()
export class EvolutionController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post(['evolution/resolve-company', 'api/evolution/resolve-company'])
  @Public()
  @UseGuards(ApiKeyGuard)
  resolveCompany(@Body() dto: ResolveEvolutionCompanyDto) {
    return this.companiesService.resolveCompanyByEvolutionInstance(dto.instance);
  }
}
