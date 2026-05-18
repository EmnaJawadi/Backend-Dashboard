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
import { CreateMessageDto } from './dto/create-message.dto';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { SaveMessageDto } from './dto/save-message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageStatusDto } from './dto/update-message-status.dto';
import { MessagesService } from './messages.service';

@Controller(['messages', 'api/messages'])
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  create(
    @Body() createMessageDto: CreateMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.messagesService.create(createMessageDto, actor);
  }

  @Post('save')
  @UseGuards(ApiKeyGuard)
  save(@Body() saveMessageDto: SaveMessageDto) {
    return this.messagesService.save(saveMessageDto);
  }

  @Post('inbound')
  @UseGuards(ApiKeyGuard)
  receiveInboundMessage(@Body() inboundMessageDto: InboundMessageDto) {
    return this.messagesService.receiveInboundMessage(inboundMessageDto);
  }

  @Post('incoming')
  @UseGuards(ApiKeyGuard)
  saveIncoming(@Body() payload: SaveMessageDto) {
    return this.messagesService.saveIncoming(payload);
  }

  @Post('bot')
  @UseGuards(ApiKeyGuard)
  saveBot(@Body() payload: SaveMessageDto) {
    return this.messagesService.saveBot(payload);
  }

  @Post('human')
  @UseGuards(ApiKeyGuard)
  saveHuman(@Body() payload: SaveMessageDto) {
    return this.messagesService.saveHuman(payload);
  }

  @Post('send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  sendMessage(
    @Body() sendMessageDto: SendMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.messagesService.sendMessage(sendMessageDto, actor);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  findAll(
    @Query() query: MessageQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.messagesService.findAll(query, actor);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.findOne(id, actor);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  updateStatus(
    @Param('id') id: string,
    @Body() updateMessageStatusDto: UpdateMessageStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.messagesService.updateStatus(id, updateMessageStatusDto, actor);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.remove(id, actor);
  }
}
