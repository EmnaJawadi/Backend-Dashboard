import { Body, Controller, Post } from '@nestjs/common';
import { CheckWindowDto } from './dto/check-window.dto';
import { ReplyWhatsappDto } from './dto/reply-whatsapp.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('check-window')
  checkWindow(@Body() checkWindowDto: CheckWindowDto) {
    return this.whatsappService.checkWindow(checkWindowDto);
  }

  @Post('send-message')
  sendMessage(@Body() sendWhatsappMessageDto: SendWhatsappMessageDto) {
    return this.whatsappService.sendMessage(sendWhatsappMessageDto);
  }

  @Post('reply')
  reply(@Body() replyWhatsappDto: ReplyWhatsappDto) {
    return this.whatsappService.reply(replyWhatsappDto);
  }

  @Post('send-template')
  sendTemplateMessage(
    @Body() sendTemplateMessageDto: SendTemplateMessageDto,
  ) {
    return this.whatsappService.sendTemplateMessage(
      sendTemplateMessageDto,
    );
  }
}
