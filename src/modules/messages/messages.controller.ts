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
  create(@Body() createMessageDto: CreateMessageDto) {
    return this.messagesService.create(createMessageDto);
  }

  @Post('save')
  save(@Body() saveMessageDto: SaveMessageDto) {
    return this.messagesService.save(saveMessageDto);
  }

  @Post('inbound')
  receiveInboundMessage(@Body() inboundMessageDto: InboundMessageDto) {
    return this.messagesService.receiveInboundMessage(inboundMessageDto);
  }

  @Post('incoming')
  saveIncoming(@Body() payload: SaveMessageDto) {
    return this.messagesService.saveIncoming(payload);
  }

  @Post('bot')
  saveBot(@Body() payload: SaveMessageDto) {
    return this.messagesService.saveBot(payload);
  }

  @Post('human')
  saveHuman(@Body() payload: SaveMessageDto) {
    return this.messagesService.saveHuman(payload);
  }

  @Post('send')
  sendMessage(@Body() sendMessageDto: SendMessageDto) {
    return this.messagesService.sendMessage(sendMessageDto);
  }

  @Get()
  findAll(@Query() query: MessageQueryDto) {
    return this.messagesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.messagesService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateMessageStatusDto: UpdateMessageStatusDto,
  ) {
    return this.messagesService.updateStatus(id, updateMessageStatusDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.messagesService.remove(id);
  }
}
