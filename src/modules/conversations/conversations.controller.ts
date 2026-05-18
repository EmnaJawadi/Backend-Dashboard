import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { GetOrCreateConversationDto } from './dto/get-or-create-conversation.dto';
import { HandoffConversationDto } from './dto/handoff-conversation.dto';
import { ReactivateBotDto } from './dto/reactivate-bot.dto';
import { UpdateConversationContextDto } from './dto/update-conversation-context.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ConversationsService } from './conversations.service';

@Controller(['conversations', 'api/conversations'])
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  create(
    @Body() createConversationDto: CreateConversationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.create(createConversationDto, actor);
  }

  @Post('get-or-create')
  @UseGuards(ApiKeyGuard)
  getOrCreate(@Body() getOrCreateConversationDto: GetOrCreateConversationDto) {
    return this.conversationsService.getOrCreateForWhatsapp(
      getOrCreateConversationDto,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  findAll(
    @Query() query: ConversationQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.findAll(query, actor);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.conversationsService.findOne(id, actor);
  }

  @Get(':id/context')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  findContext(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.conversationsService.findContext(id, actor);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  update(
    @Param('id') id: string,
    @Body() updateConversationDto: UpdateConversationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.update(id, updateConversationDto, actor);
  }

  @Patch(':id/context')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  updateContext(
    @Param('id') id: string,
    @Body() updateConversationContextDto: UpdateConversationContextDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.updateContext(
      id,
      updateConversationContextDto,
      actor,
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  updateStatus(
    @Param('id') id: string,
    @Body() updateConversationStatusDto: UpdateConversationStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.updateStatus(
      id,
      updateConversationStatusDto,
      actor,
    );
  }

  @Patch(':id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  assign(
    @Param('id') id: string,
    @Body() assignConversationDto: AssignConversationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.assign(id, assignConversationDto, actor);
  }

  @Patch(':id/handoff')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  handoff(
    @Param('id') id: string,
    @Body() handoffConversationDto: HandoffConversationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.handoff(id, handoffConversationDto, actor);
  }

  @Patch(':id/reactivate-bot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  reactivateBot(
    @Param('id') id: string,
    @Body() reactivateBotDto: ReactivateBotDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationsService.reactivateBot(id, reactivateBotDto, actor);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.conversationsService.remove(id, actor);
  }
}
