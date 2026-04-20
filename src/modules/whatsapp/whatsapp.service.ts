import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WhatsappProviderService } from '../../integrations/whatsapp/whatsapp-provider.interface';
import { CheckWindowDto } from './dto/check-window.dto';
import {
  ReplyWhatsappDto,
  WhatsappReplyTemplateDto,
} from './dto/reply-whatsapp.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { TemplateRequiredException } from './exceptions/template-required.exception';
import { WhatsappMapper } from './mappers/whatsapp.mapper';
import {
  ConversationWindowService,
  ConversationWindowStatus,
} from './policies/conversation-window.service';
import { WhatsappComplianceService } from './policies/whatsapp-compliance.service';

type WhatsappConversationContext = {
  id: string;
  companyId: string | null;
  contactId: string;
  status: string | null;
  assignedTo: string | null;
  botPaused: boolean | null;
  handoffRequired: boolean | null;
  lastCustomerMessageAt: Date | null;
  contact: {
    phone: string | null;
  } | null;
};

type NormalizedTemplate = {
  templateId?: string;
  providerTemplateId?: string | null;
  templateName: string;
  language: string;
  parameters: string[];
  variables?: Record<string, string>;
};

type ReplyReason =
  | 'BOT_PAUSED'
  | 'HUMAN_TAKEOVER_ACTIVE'
  | '24_HOUR_WINDOW_CLOSED'
  | 'NO_CUSTOMER_MESSAGE'
  | 'TEMPLATE_REQUIRED';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
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

  async reply(replyWhatsappDto: ReplyWhatsappDto) {
    const conversation = replyWhatsappDto.conversationId
      ? await this.findConversationContext(replyWhatsappDto.conversationId)
      : null;

    const phoneNumber = this.resolvePhoneNumber(
      replyWhatsappDto.phoneNumber,
      conversation,
    );

    const windowStatus = this.conversationWindowService.checkWindow(
      conversation?.lastCustomerMessageAt ??
        replyWhatsappDto.lastCustomerMessageAt ??
        null,
    );

    const template = await this.resolveTemplate(
      {
        template: replyWhatsappDto.template,
        templateId: replyWhatsappDto.templateId,
        templateName: replyWhatsappDto.templateName,
        language: replyWhatsappDto.language,
        parameters: replyWhatsappDto.parameters,
        variables: replyWhatsappDto.variables,
      },
      conversation?.companyId,
      false,
    );

    const automated = replyWhatsappDto.automated ?? true;
    const botPaused = conversation?.botPaused === true;
    const humanTakeoverActive = this.isHumanTakeoverActive(conversation);

    if (automated && botPaused) {
      return this.skippedResponse({
        conversation,
        phoneNumber,
        windowStatus,
        reason: 'BOT_PAUSED',
        message:
          'Bot is paused for this conversation. Automatic WhatsApp replies are disabled.',
        botPaused,
        humanTakeoverActive,
      });
    }

    if (automated && humanTakeoverActive) {
      return this.skippedResponse({
        conversation,
        phoneNumber,
        windowStatus,
        reason: 'HUMAN_TAKEOVER_ACTIVE',
        message:
          'Human takeover is active. The backend will not send an AI reply automatically.',
        botPaused,
        humanTakeoverActive,
      });
    }

    if (!windowStatus.isWithinWindow) {
      if (!template) {
        return this.templateRequiredResponse({
          conversation,
          phoneNumber,
          windowStatus,
          botPaused,
          humanTakeoverActive,
        });
      }

      return this.sendTemplate({
        phoneNumber,
        template,
        conversation,
        windowStatus,
        senderId: replyWhatsappDto.senderId,
        senderType: replyWhatsappDto.senderType ?? 'bot',
        action: 'sent_template',
      });
    }

    const message = replyWhatsappDto.message
      ? this.whatsappComplianceService.validateMessageContent(
          replyWhatsappDto.message,
        )
      : null;

    if (message) {
      return this.sendFreeFormText({
        phoneNumber,
        message,
        conversation,
        windowStatus,
        senderId: replyWhatsappDto.senderId,
        senderType: replyWhatsappDto.senderType ?? 'bot',
        action: 'sent_free_form',
      });
    }

    if (template) {
      return this.sendTemplate({
        phoneNumber,
        template,
        conversation,
        windowStatus,
        senderId: replyWhatsappDto.senderId,
        senderType: replyWhatsappDto.senderType ?? 'bot',
        action: 'sent_template',
      });
    }

    throw new BadRequestException({
      code: 'MESSAGE_OR_TEMPLATE_REQUIRED',
      message:
        'Provide a free-form message while the 24-hour window is open, or provide a WhatsApp template.',
    });
  }

  async sendMessage(sendWhatsappMessageDto: SendWhatsappMessageDto) {
    const phoneNumber = this.whatsappComplianceService.validatePhoneNumber(
      sendWhatsappMessageDto.phoneNumber,
    );

    const message = this.whatsappComplianceService.validateMessageContent(
      sendWhatsappMessageDto.message,
    );

    const conversation = sendWhatsappMessageDto.conversationId
      ? await this.findConversationContext(sendWhatsappMessageDto.conversationId)
      : null;

    const windowStatus = this.conversationWindowService.checkWindow(
      conversation?.lastCustomerMessageAt ??
        sendWhatsappMessageDto.lastCustomerMessageAt ??
        null,
    );

    if (!windowStatus.canSendFreeForm) {
      throw new TemplateRequiredException(windowStatus);
    }

    return this.sendFreeFormText({
      phoneNumber,
      message,
      conversation,
      windowStatus,
      senderId: sendWhatsappMessageDto.senderId,
      senderType: sendWhatsappMessageDto.senderType ?? 'agent',
      action: 'sent_free_form',
    });
  }

  async sendTemplateMessage(sendTemplateMessageDto: SendTemplateMessageDto) {
    const conversation = sendTemplateMessageDto.conversationId
      ? await this.findConversationContext(sendTemplateMessageDto.conversationId)
      : null;

    const phoneNumber = this.whatsappComplianceService.validatePhoneNumber(
      sendTemplateMessageDto.phoneNumber,
    );

    const template = await this.resolveTemplate(
      {
        templateId: sendTemplateMessageDto.templateId,
        templateName: sendTemplateMessageDto.templateName,
        language: sendTemplateMessageDto.language,
        parameters: sendTemplateMessageDto.parameters,
        variables: sendTemplateMessageDto.variables,
      },
      conversation?.companyId,
      true,
    );

    return this.sendTemplate({
      phoneNumber,
      template,
      conversation,
      windowStatus: null,
      senderId: sendTemplateMessageDto.senderId,
      senderType: 'agent',
      action: 'sent_template',
    });
  }

  private async sendFreeFormText(params: {
    phoneNumber: string;
    message: string;
    conversation: WhatsappConversationContext | null;
    windowStatus: ConversationWindowStatus;
    senderId?: string | null;
    senderType: 'agent' | 'bot' | 'system';
    action: 'sent_free_form';
  }) {
    const payload = WhatsappMapper.mapMessagePayload({
      phoneNumber: params.phoneNumber,
      message: params.message,
      conversationId: params.conversation?.id,
    });

    const providerResult = await this.whatsappProviderService.sendTextMessage({
      to: params.phoneNumber,
      text: params.message,
    });

    const storedMessage = await this.recordOutboundMessage({
      conversation: params.conversation,
      externalMessageId: providerResult.messageId,
      senderType: params.senderType,
      senderId: params.senderId,
      content: params.message,
      messageType: 'text',
      deliveryStatus: 'sent',
      rawPayload: {
        payload,
        provider: providerResult.provider,
        raw: providerResult.raw,
      },
    });

    return this.sentResponse({
      action: params.action,
      phoneNumber: params.phoneNumber,
      conversation: params.conversation,
      windowStatus: params.windowStatus,
      providerResult,
      payload,
      storedMessageId: storedMessage?.id ?? null,
      messageType: 'text',
      templateName: null,
    });
  }

  private async sendTemplate(params: {
    phoneNumber: string;
    template: NormalizedTemplate;
    conversation: WhatsappConversationContext | null;
    windowStatus: ConversationWindowStatus | null;
    senderId?: string | null;
    senderType: 'agent' | 'bot' | 'system';
    action: 'sent_template';
  }) {
    const payload = WhatsappMapper.mapTemplatePayload({
      phoneNumber: params.phoneNumber,
      templateName: params.template.templateName,
      language: params.template.language,
      parameters: params.template.parameters,
      variables: params.template.variables,
      conversationId: params.conversation?.id,
    });

    const providerResult =
      await this.whatsappProviderService.sendTemplateMessage({
        to: params.phoneNumber,
        templateName: params.template.templateName,
        language: params.template.language,
        parameters: params.template.parameters,
        variables: params.template.variables,
      });

    const storedMessage = await this.recordOutboundMessage({
      conversation: params.conversation,
      externalMessageId: providerResult.messageId,
      senderType: params.senderType,
      senderId: params.senderId,
      content: this.buildTemplateContent(params.template),
      messageType: 'template',
      deliveryStatus: 'sent',
      templateName: params.template.templateName,
      rawPayload: {
        payload,
        provider: providerResult.provider,
        raw: providerResult.raw,
        templateId: params.template.templateId ?? null,
        providerTemplateId: params.template.providerTemplateId ?? null,
        templateName: params.template.templateName,
        language: params.template.language,
        parameters: params.template.parameters,
        variables: params.template.variables ?? null,
      },
    });

    return this.sentResponse({
      action: params.action,
      phoneNumber: params.phoneNumber,
      conversation: params.conversation,
      windowStatus: params.windowStatus,
      providerResult,
      payload,
      storedMessageId: storedMessage?.id ?? null,
      messageType: 'template',
      templateName: params.template.templateName,
    });
  }

  private async recordOutboundMessage(params: {
    conversation: WhatsappConversationContext | null;
    externalMessageId: string | null;
    senderType: 'agent' | 'bot' | 'system';
    senderId?: string | null;
    content: string;
    messageType: 'text' | 'template';
    deliveryStatus: 'sent' | 'failed';
    rawPayload: Record<string, unknown>;
    templateName?: string | null;
  }) {
    if (!params.conversation) {
      return null;
    }

    const now = new Date();
    const rawPayload = {
      ...params.rawPayload,
      ...(params.templateName ? { templateName: params.templateName } : {}),
      senderId: params.senderId ?? null,
    };

    const message = await this.prisma.message.create({
      data: {
        companyId: params.conversation.companyId,
        conversationId: params.conversation.id,
        externalMessageId: params.externalMessageId,
        direction: 'outbound',
        senderType: params.senderType,
        content: params.content,
        messageType: params.messageType,
        mediaUrl: null,
        mimeType: null,
        rawPayload: this.toJson(rawPayload),
        deliveryStatus: params.deliveryStatus,
        errorMessage: null,
        createdAt: now,
        messageTimestamp: now,
      },
    });

    await this.prisma.conversation.update({
      where: { id: params.conversation.id },
      data: {
        lastMessageAt: now,
        lastBotMessageAt: params.senderType === 'bot' ? now : undefined,
        lastHumanMessageAt: params.senderType === 'agent' ? now : undefined,
        updatedAt: now,
      },
    });

    return message;
  }

  private async findConversationContext(
    conversationId: string,
  ): Promise<WhatsappConversationContext> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: {
          select: {
            phone: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(
        `Conversation with id ${conversationId} not found`,
      );
    }

    return conversation;
  }

  private resolvePhoneNumber(
    phoneNumber: string | undefined,
    conversation: WhatsappConversationContext | null,
  ) {
    const resolvedPhoneNumber = phoneNumber ?? conversation?.contact?.phone;

    if (!resolvedPhoneNumber) {
      throw new BadRequestException({
        code: 'PHONE_NUMBER_REQUIRED',
        message:
          'Provide phoneNumber or conversationId linked to a contact phone number.',
      });
    }

    return this.whatsappComplianceService.validatePhoneNumber(
      resolvedPhoneNumber,
    );
  }

  private async resolveTemplate(
    input: {
      template?: WhatsappReplyTemplateDto;
      templateId?: string;
      templateName?: string;
      language?: string;
      parameters?: string[];
      variables?: Record<string, string>;
    },
    companyId: string | null | undefined,
    required: true,
  ): Promise<NormalizedTemplate>;
  private async resolveTemplate(
    input: {
      template?: WhatsappReplyTemplateDto;
      templateId?: string;
      templateName?: string;
      language?: string;
      parameters?: string[];
      variables?: Record<string, string>;
    },
    companyId: string | null | undefined,
    required: false,
  ): Promise<NormalizedTemplate | null>;
  private async resolveTemplate(
    input: {
      template?: WhatsappReplyTemplateDto;
      templateId?: string;
      templateName?: string;
      language?: string;
      parameters?: string[];
      variables?: Record<string, string>;
    },
    companyId: string | null | undefined,
    required: boolean,
  ): Promise<NormalizedTemplate | null> {
    const nested = input.template;
    const templateId = this.cleanString(nested?.templateId ?? input.templateId);
    let templateName = this.cleanString(
      nested?.templateName ?? input.templateName,
    );
    let language = this.cleanString(nested?.language ?? input.language);
    let providerTemplateId: string | null = null;

    if (templateId) {
      const templateRecord = await this.findTemplateRecord(
        templateId,
        companyId,
      );

      if (!templateRecord) {
        throw new BadRequestException({
          code: 'TEMPLATE_NOT_FOUND',
          message: `Message template ${templateId} was not found.`,
        });
      }

      this.assertTemplateApproved(templateRecord.status);
      providerTemplateId = templateRecord.providerTemplateId;
      templateName =
        templateName ??
        templateRecord.providerTemplateId ??
        templateRecord.name ??
        null;
      language = language ?? templateRecord.language ?? 'fr';
    }

    if (!templateName) {
      if (!required) {
        return null;
      }

      throw new BadRequestException({
        code: 'TEMPLATE_NAME_REQUIRED',
        message: 'templateName is required to send a WhatsApp template.',
      });
    }

    return {
      templateId: templateId ?? undefined,
      providerTemplateId,
      templateName:
        this.whatsappComplianceService.validateTemplateName(templateName),
      language: language ?? 'fr',
      parameters: nested?.parameters ?? input.parameters ?? [],
      variables: this.normalizeVariables(nested?.variables ?? input.variables),
    };
  }

  private async findTemplateRecord(
    templateId: string,
    companyId: string | null | undefined,
  ) {
    const where: Prisma.MessageTemplateWhereInput = {
      OR: [{ id: templateId }, { providerTemplateId: templateId }],
    };

    if (companyId) {
      where.companyId = companyId;
    }

    return this.prisma.messageTemplate.findFirst({ where });
  }

  private assertTemplateApproved(status?: string | null) {
    if (!status) {
      return;
    }

    const normalizedStatus = status.toLowerCase();

    if (!['approved', 'active'].includes(normalizedStatus)) {
      throw new BadRequestException({
        code: 'TEMPLATE_NOT_APPROVED',
        message:
          'The selected WhatsApp template is not marked as approved/active.',
        status,
      });
    }
  }

  private isHumanTakeoverActive(
    conversation: WhatsappConversationContext | null,
  ) {
    if (!conversation) {
      return false;
    }

    return (
      conversation.handoffRequired === true ||
      conversation.status === 'human_assigned' ||
      Boolean(conversation.assignedTo)
    );
  }

  private skippedResponse(params: {
    conversation: WhatsappConversationContext | null;
    phoneNumber: string;
    windowStatus: ConversationWindowStatus;
    reason: Extract<ReplyReason, 'BOT_PAUSED' | 'HUMAN_TAKEOVER_ACTIVE'>;
    message: string;
    botPaused: boolean;
    humanTakeoverActive: boolean;
  }) {
    return {
      sent: false,
      skipped: true,
      action: 'skipped',
      canSendFreeForm: false,
      templateRequired: params.windowStatus.templateRequired,
      reason: params.reason,
      message: params.message,
      channel: 'whatsapp',
      phoneNumber: params.phoneNumber,
      conversationId: params.conversation?.id ?? null,
      messageType: null,
      messageId: null,
      provider: null,
      botPaused: params.botPaused,
      humanTakeoverActive: params.humanTakeoverActive,
      window: this.serializeWindow(params.windowStatus),
    };
  }

  private templateRequiredResponse(params: {
    conversation: WhatsappConversationContext | null;
    phoneNumber: string;
    windowStatus: ConversationWindowStatus;
    botPaused: boolean;
    humanTakeoverActive: boolean;
  }) {
    return {
      sent: false,
      skipped: true,
      action: 'template_required',
      canSendFreeForm: false,
      templateRequired: true,
      reason: params.windowStatus.reason ?? '24_HOUR_WINDOW_CLOSED',
      code: 'TEMPLATE_REQUIRED',
      message:
        '24-hour WhatsApp customer service window is closed. Provide an approved templateName/templateId to send a template message.',
      channel: 'whatsapp',
      phoneNumber: params.phoneNumber,
      conversationId: params.conversation?.id ?? null,
      messageType: null,
      messageId: null,
      provider: null,
      botPaused: params.botPaused,
      humanTakeoverActive: params.humanTakeoverActive,
      window: this.serializeWindow(params.windowStatus),
    };
  }

  private sentResponse(params: {
    action: 'sent_free_form' | 'sent_template';
    phoneNumber: string;
    conversation: WhatsappConversationContext | null;
    windowStatus: ConversationWindowStatus | null;
    providerResult: {
      success: boolean;
      provider: string;
      messageId: string | null;
      raw: Record<string, unknown> | null;
    };
    payload: Record<string, unknown>;
    storedMessageId: string | null;
    messageType: 'text' | 'template';
    templateName: string | null;
  }) {
    return {
      success: params.providerResult.success,
      sent: params.providerResult.success,
      skipped: false,
      action: params.action,
      canSendFreeForm: params.windowStatus?.canSendFreeForm ?? false,
      templateRequired: params.windowStatus?.templateRequired ?? false,
      reason: params.windowStatus?.reason ?? null,
      channel: 'whatsapp',
      phoneNumber: params.phoneNumber,
      conversationId: params.conversation?.id ?? null,
      messageType: params.messageType,
      templateName: params.templateName,
      provider: params.providerResult.provider,
      messageId: params.providerResult.messageId,
      storedMessageId: params.storedMessageId,
      raw: params.providerResult.raw,
      payload: params.payload,
      sentAt: new Date(),
      window: params.windowStatus
        ? this.serializeWindow(params.windowStatus)
        : null,
    };
  }

  private serializeWindow(windowStatus: ConversationWindowStatus) {
    return {
      isWithinWindow: windowStatus.isWithinWindow,
      isOpen: windowStatus.isOpen,
      canSendFreeForm: windowStatus.canSendFreeForm,
      templateRequired: windowStatus.templateRequired,
      reason: windowStatus.reason,
      remainingHours: windowStatus.remainingHours,
      expiresAt: windowStatus.expiresAt?.toISOString() ?? null,
      lastCustomerMessageAt:
        windowStatus.lastCustomerMessageAt?.toISOString() ?? null,
      windowHours: windowStatus.windowHours,
    };
  }

  private buildTemplateContent(template: NormalizedTemplate) {
    return `[template:${template.templateName}]`;
  }

  private cleanString(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeVariables(variables?: Record<string, string>) {
    if (!variables) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(variables).map(([key, value]) => [key, String(value)]),
    );
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }
}
