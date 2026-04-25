import { Body, Controller, Post } from '@nestjs/common';
import { ReplyWhatsappDto } from './dto/reply-whatsapp.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('send-message')
  sendMessage(@Body() sendWhatsappMessageDto: SendWhatsappMessageDto) {
    return this.whatsappService.sendMessage(sendWhatsappMessageDto);
  }

  @Post('reply')
  reply(@Body() replyWhatsappDto: ReplyWhatsappDto) {
    return this.whatsappService.reply(replyWhatsappDto);
  }
}
