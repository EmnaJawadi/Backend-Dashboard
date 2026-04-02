import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AddConversationTagDto } from './dto/add-conversation-tag.dto';
import { RemoveConversationTagDto } from './dto/remove-conversation-tag.dto';
import { ConversationTagsService } from './conversation-tags.service';

@Controller('conversation-tags')
export class ConversationTagsController {
  constructor(
    private readonly conversationTagsService: ConversationTagsService,
  ) {}

  @Post()
  add(@Body() addConversationTagDto: AddConversationTagDto) {
    return this.conversationTagsService.add(addConversationTagDto);
  }

  @Get()
  findAll(@Query('conversationId') conversationId?: string) {
    return this.conversationTagsService.findAll(conversationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.conversationTagsService.findOne(id);
  }

  @Delete()
  remove(@Body() removeConversationTagDto: RemoveConversationTagDto) {
    return this.conversationTagsService.remove(removeConversationTagDto);
  }

  @Delete(':id')
  removeById(@Param('id') id: string) {
    return this.conversationTagsService.removeById(id);
  }
}