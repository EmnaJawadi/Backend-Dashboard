import { Injectable } from '@nestjs/common';
import { WhatsappProviderService } from '../../integrations/whatsapp/whatsapp-provider.interface';
import { CheckWindowDto } from './dto/check-window.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappMapper } from './mappers/whatsapp.mapper';
import { ConversationWindowService } from './policies/conversation-window.service';
import { WhatsappComplianceService } from './policies/whatsapp-compliance.service';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly whatsappProviderService: WhatsappProviderService,
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

  async sendMessage(sendWhatsappMessageDto: SendWhatsappMessageDto) {
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

    const providerResult = await this.whatsappProviderService.sendTextMessage({
      to: phoneNumber,
      text: message,
    });

    return {
      success: providerResult.success,
      channel: 'whatsapp',
      provider: providerResult.provider,
      messageId: providerResult.messageId,
      raw: providerResult.raw,
      payload,
      sentAt: new Date(),
    };
  }

  async sendTemplateMessage(sendTemplateMessageDto: SendTemplateMessageDto) {
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

    // Evolution API template support differs by provider configuration.
    // For n8n MVP we guarantee delivery by sending a text fallback.
    const fallbackMessage = [
      `[template:${templateName}]`,
      ...(sendTemplateMessageDto.variables
        ? Object.entries(sendTemplateMessageDto.variables).map(
            ([key, value]) => `${key}: ${value}`,
          )
        : []),
    ].join('\n');

    const providerResult = await this.whatsappProviderService.sendTextMessage({
      to: phoneNumber,
      text: fallbackMessage,
    });

    return {
      success: providerResult.success,
      channel: 'whatsapp',
      provider: providerResult.provider,
      messageId: providerResult.messageId,
      raw: providerResult.raw,
      payload,
      sentAt: new Date(),
      templateDeliveryMode: 'text-fallback',
    };
  }
}
