import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  create(@Body() createConversationDto: CreateConversationDto) {
    return this.conversationsService.create(createConversationDto);
  }

  @Post('get-or-create')
  getOrCreate(@Body() getOrCreateConversationDto: GetOrCreateConversationDto) {
    return this.conversationsService.getOrCreateForWhatsapp(
      getOrCreateConversationDto,
    );
  }

  @Get()
  findAll(@Query() query: ConversationQueryDto) {
    return this.conversationsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @Get(':id/context')
  findContext(@Param('id') id: string) {
    return this.conversationsService.findContext(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateConversationDto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(id, updateConversationDto);
  }

  @Patch(':id/context')
  updateContext(
    @Param('id') id: string,
    @Body() updateConversationContextDto: UpdateConversationContextDto,
  ) {
    return this.conversationsService.updateContext(id, updateConversationContextDto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateConversationStatusDto: UpdateConversationStatusDto,
  ) {
    return this.conversationsService.updateStatus(
      id,
      updateConversationStatusDto,
    );
  }

  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() assignConversationDto: AssignConversationDto,
  ) {
    return this.conversationsService.assign(id, assignConversationDto);
  }

  @Patch(':id/handoff')
  handoff(
    @Param('id') id: string,
    @Body() handoffConversationDto: HandoffConversationDto,
  ) {
    return this.conversationsService.handoff(id, handoffConversationDto);
  }

  @Patch(':id/reactivate-bot')
  reactivateBot(
    @Param('id') id: string,
    @Body() reactivateBotDto: ReactivateBotDto,
  ) {
    return this.conversationsService.reactivateBot(id, reactivateBotDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.conversationsService.remove(id);
  }
}
