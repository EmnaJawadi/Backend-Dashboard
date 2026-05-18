import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CompanyWhatsappConnectDto } from './dto/company-whatsapp-instance.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('company/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class CompanyWhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('config')
  getConfig(@CurrentUser() actor: AuthenticatedUser) {
    return this.whatsappService.getCompanyWhatsappConfig(actor);
  }

  @Post('connect')
  connect(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CompanyWhatsappConnectDto,
  ) {
    return this.whatsappService.connectCompanyWhatsapp(actor, dto);
  }

  @Get('qr')
  getQr(@CurrentUser() actor: AuthenticatedUser) {
    return this.whatsappService.getCompanyWhatsappQr(actor);
  }

  @Post('test-connection')
  testConnection(@CurrentUser() actor: AuthenticatedUser) {
    return this.whatsappService.testCompanyInstance(actor);
  }

  @Post('disconnect')
  disconnect(@CurrentUser() actor: AuthenticatedUser) {
    return this.whatsappService.disconnectCompanyWhatsapp(actor);
  }

  @Post('reset')
  reset(@CurrentUser() actor: AuthenticatedUser) {
    return this.whatsappService.resetCompanyWhatsapp(actor);
  }
}
