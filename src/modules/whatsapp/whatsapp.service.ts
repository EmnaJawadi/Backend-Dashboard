import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WhatsappProviderService } from '../../integrations/whatsapp/whatsapp-provider.interface';
import { ReplyWhatsappDto } from './dto/reply-whatsapp.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappComplianceService } from './policies/whatsapp-compliance.service';

type WhatsappConversationContext = {
  id: string;
  companyId: string | null;
  assignedTo: string | null;
  status: string | null;
  botPaused: boolean | null;
  handoffRequired: boolean | null;
  contact: {
    phone: string | null;
  } | null;
};

@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappProviderService: WhatsappProviderService,
    private readonly whatsappComplianceService: WhatsappComplianceService,
  ) {}

  async reply(replyWhatsappDto: ReplyWhatsappDto) {
    const conversation = replyWhatsappDto.conversationId
      ? await this.findConversationContext(replyWhatsappDto.conversationId)
      : null;

    if (replyWhatsappDto.automated && this.isHumanTakeoverActive(conversation)) {
      return {
        sent: false,
        skipped: true,
        action: 'skipped',
        canSendFreeForm: true,
        reason: 'HUMAN_TAKEOVER_ACTIVE',
        message:
          'Automatic AI reply skipped because this conversation is assigned to a human.',
        messageType: null,
        messageId: null,
        storedMessageId: null,
      };
    }

    const phoneNumber = this.resolvePhoneNumber(
      replyWhatsappDto.phoneNumber,
      conversation,
    );
    const message = this.whatsappComplianceService.validateMessageContent(
      replyWhatsappDto.message,
    );
    const instanceName = await this.resolveInstanceName({
      companyId: conversation?.companyId ?? null,
      providedInstance: replyWhatsappDto.instanceName,
    });

    return this.sendText({
      phoneNumber,
      message,
      conversation,
      senderType: replyWhatsappDto.senderType ?? 'bot',
      senderId: replyWhatsappDto.senderId,
      instanceName,
      action: 'sent_free_form',
    });
  }

  async sendMessage(sendWhatsappMessageDto: SendWhatsappMessageDto) {
    const conversation = sendWhatsappMessageDto.conversationId
      ? await this.findConversationContext(sendWhatsappMessageDto.conversationId)
      : null;

    const phoneNumber = this.resolvePhoneNumber(
      sendWhatsappMessageDto.phoneNumber,
      conversation,
    );
    const message = this.whatsappComplianceService.validateMessageContent(
      sendWhatsappMessageDto.message,
    );
    const instanceName = await this.resolveInstanceName({
      companyId: conversation?.companyId ?? null,
      providedInstance: sendWhatsappMessageDto.instanceName,
    });

    return this.sendText({
      phoneNumber,
      message,
      conversation,
      senderType: sendWhatsappMessageDto.senderType ?? 'agent',
      senderId: sendWhatsappMessageDto.senderId,
      instanceName,
      action: 'sent_free_form',
    });
  }

  private async sendText(params: {
    phoneNumber: string;
    message: string;
    conversation: WhatsappConversationContext | null;
    senderType: 'agent' | 'bot' | 'system';
    senderId?: string | null;
    instanceName: string | null;
    action: 'sent_free_form';
  }) {
    if (!params.instanceName) {
      throw new BadRequestException({
        code: 'EVOLUTION_INSTANCE_NOT_CONFIGURED',
        message:
          'No Evolution instance is linked to this company yet. Connect WhatsApp first.',
      });
    }

    const providerResult = await this.whatsappProviderService.sendTextMessage({
      to: params.phoneNumber,
      text: params.message,
      instanceName: params.instanceName,
    });

    const storedMessage = await this.recordOutboundMessage({
      conversation: params.conversation,
      externalMessageId: providerResult.messageId,
      senderType: params.senderType,
      senderId: params.senderId,
      content: params.message,
      rawPayload: {
        provider: providerResult.provider,
        raw: providerResult.raw,
        instanceName: params.instanceName,
      },
    });

    return {
      success: providerResult.success,
      sent: providerResult.success,
      skipped: false,
      action: params.action,
      canSendFreeForm: true,
      reason: null,
      messageType: 'text',
      messageId: providerResult.messageId,
      storedMessageId: storedMessage?.id ?? null,
      instanceName: params.instanceName,
    };
  }

  private async recordOutboundMessage(params: {
    conversation: WhatsappConversationContext | null;
    externalMessageId: string | null;
    senderType: 'agent' | 'bot' | 'system';
    senderId?: string | null;
    content: string;
    rawPayload: Record<string, unknown>;
  }) {
    if (!params.conversation) {
      return null;
    }

    const now = new Date();
    const message = await this.prisma.message.create({
      data: {
        companyId: params.conversation.companyId,
        conversationId: params.conversation.id,
        externalMessageId: params.externalMessageId,
        direction: 'outbound',
        senderType: params.senderType,
        content: params.content,
        messageType: 'text',
        mediaUrl: null,
        mimeType: null,
        rawPayload: this.toJson({
          ...params.rawPayload,
          senderId: params.senderId ?? null,
        }),
        deliveryStatus: 'sent',
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

  private isHumanTakeoverActive(
    conversation: WhatsappConversationContext | null,
  ) {
    if (!conversation) {
      return false;
    }

    return (
      conversation.handoffRequired === true ||
      conversation.status === 'human_assigned' ||
      Boolean(conversation.assignedTo) ||
      conversation.botPaused === true
    );
  }

  private async resolveInstanceName(params: {
    companyId: string | null;
    providedInstance?: string;
  }) {
    if (params.providedInstance?.trim()) {
      return params.providedInstance.trim();
    }

    if (!params.companyId) {
      return null;
    }

    const linked = await this.prisma.companyWhatsappInstance.findFirst({
      where: {
        companyId: params.companyId,
      },
      orderBy: [{ connectionStatus: 'desc' }, { updatedAt: 'desc' }],
    });

    return linked?.evolutionInstanceName ?? null;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }
}
