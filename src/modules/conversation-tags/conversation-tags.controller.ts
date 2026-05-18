import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AddConversationTagDto } from './dto/add-conversation-tag.dto';
import { RemoveConversationTagDto } from './dto/remove-conversation-tag.dto';
import { ConversationTagsService } from './conversation-tags.service';

@Controller('conversation-tags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class ConversationTagsController {
  constructor(
    private readonly conversationTagsService: ConversationTagsService,
  ) {}

  @Post()
  add(
    @Body() addConversationTagDto: AddConversationTagDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationTagsService.add(addConversationTagDto, actor);
  }

  @Get()
  findAll(
    @Query('conversationId') conversationId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationTagsService.findAll(conversationId, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.conversationTagsService.findOne(id, actor);
  }

  @Delete()
  remove(
    @Body() removeConversationTagDto: RemoveConversationTagDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.conversationTagsService.remove(removeConversationTagDto, actor);
  }

  @Delete(':id')
  removeById(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.conversationTagsService.removeById(id, actor);
  }
}
