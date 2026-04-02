import { Injectable } from '@nestjs/common';
import { CheckWindowDto } from './dto/check-window.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappMapper } from './mappers/whatsapp.mapper';
import { ConversationWindowService } from './policies/conversation-window.service';
import { WhatsappComplianceService } from './policies/whatsapp-compliance.service';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly conversationWindowService: ConversationWindowService,
    private readonly whatsappComplianceService: WhatsappComplianceService,
  ) {}

  checkWindow(checkWindowDto: CheckWindowDto) {
    const phoneNumber = this.whatsappComplianceService.validatePhoneNumber(
      checkWindowDto.phoneNumber,
    );

    const windowStatus = this.conversationWindowService.checkWindow(
      checkWindowDto.lastCustomerMessageAt,
    );

    return {
      phoneNumber,
      ...windowStatus,
    };
  }

  sendMessage(sendWhatsappMessageDto: SendWhatsappMessageDto) {
    const phoneNumber = this.whatsappComplianceService.validatePhoneNumber(
      sendWhatsappMessageDto.phoneNumber,
    );

    const message = this.whatsappComplianceService.validateMessageContent(
      sendWhatsappMessageDto.message,
    );

    const payload = WhatsappMapper.mapMessagePayload({
      phoneNumber,
      message,
      conversationId: sendWhatsappMessageDto.conversationId,
    });

    return {
      success: true,
      channel: 'whatsapp',
      provider: 'mock',
      payload,
      sentAt: new Date(),
    };
  }

  sendTemplateMessage(sendTemplateMessageDto: SendTemplateMessageDto) {
    const phoneNumber = this.whatsappComplianceService.validatePhoneNumber(
      sendTemplateMessageDto.phoneNumber,
    );

    const templateName = this.whatsappComplianceService.validateTemplateName(
      sendTemplateMessageDto.templateName,
    );

    const payload = WhatsappMapper.mapTemplatePayload({
      phoneNumber,
      templateName,
      language: sendTemplateMessageDto.language,
      variables: sendTemplateMessageDto.variables,
      conversationId: sendTemplateMessageDto.conversationId,
    });

    return {
      success: true,
      channel: 'whatsapp',
      provider: 'mock',
      payload,
      sentAt: new Date(),
    };
  }
}