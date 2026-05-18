import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UpdateCompanyWhatsappInstanceDto } from './dto/company-whatsapp-instance.dto';
import { ReplyWhatsappDto } from './dto/reply-whatsapp.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('company-instance')
  @Roles(UserRole.SUPER_ADMIN)
  getCompanyInstance(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.whatsappService.getCompanyInstance(actor, companyId);
  }

  @Post('company-instance/test')
  @Roles(UserRole.SUPER_ADMIN)
  testCompanyInstance(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.whatsappService.testCompanyInstance(actor, companyId);
  }

  @Post('company-instance')
  @Roles(UserRole.SUPER_ADMIN)
  updateCompanyInstance(
    @Body() payload: UpdateCompanyWhatsappInstanceDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.whatsappService.updateCompanyInstance(actor, payload, companyId);
  }

  @Post('company-instance/save')
  @Roles(UserRole.SUPER_ADMIN)
  saveCompanyInstance(
    @Body() payload: UpdateCompanyWhatsappInstanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.whatsappService.updateCompanyInstance(actor, payload);
  }

  @Post('company-instance/get')
  @Roles(UserRole.SUPER_ADMIN)
  getCompanyInstancePost(@CurrentUser() actor: AuthenticatedUser) {
    return this.whatsappService.getCompanyInstance(actor);
  }

  @Post('connection/test')
  @Roles(UserRole.SUPER_ADMIN)
  testConnectionAlias(@CurrentUser() actor: AuthenticatedUser) {
    return this.whatsappService.testCompanyInstance(actor);
  }

  @Post('config')
  @Roles(UserRole.SUPER_ADMIN)
  updateConfigAlias(
    @Body() payload: UpdateCompanyWhatsappInstanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.whatsappService.updateCompanyInstance(actor, payload);
  }

  @Post('send-message')
  sendMessage(
    @Body() sendWhatsappMessageDto: SendWhatsappMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.whatsappService.sendMessage(sendWhatsappMessageDto, actor);
  }

  @Post('reply')
  reply(
    @Body() replyWhatsappDto: ReplyWhatsappDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.whatsappService.reply(replyWhatsappDto, actor);
  }
}
