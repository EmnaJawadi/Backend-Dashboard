import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  buildEvolutionInstanceLookupCandidates,
  findMatchingEvolutionInstance,
} from '../../common/utils/evolution-instance.util';
import { EvolutionWebhookDto } from './dto/evolution-webhook.dto';
import { WebhookQueryDto } from './dto/webhook-query.dto';
import { WebhooksRepository } from './webhooks.repository';
import { normalizeEvolutionWebhook } from './utils/webhook-normalizer.util';
import { InboundMessagesHandler } from './handlers/inbound-message.handler';
import { DeliveryStatusHandler } from './handlers/delivery-status.handler';
import { ConversationEventsHandler } from './handlers/conversation-event.handler';
import { NormalizedWebhookDto } from './dto/normalized-webhook.dto';
import { N8nNormalizedMessageDto } from './dto/n8n-normalized-message.dto';
import { N8nService } from '../../integrations/n8n/n8n.service';
import { AiReplyResponseDto } from '../ai/dto/ai-reply-response.dto';
import { WorkflowAiService } from '../ai/workflow-ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationPriority, NotificationType, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly webhooksRepository: WebhooksRepository,
    private readonly inboundMessagesHandler: InboundMessagesHandler,
    private readonly deliveryStatusHandler: DeliveryStatusHandler,
    private readonly conversationEventsHandler: ConversationEventsHandler,
    private readonly n8nService: N8nService,
    private readonly aiService: WorkflowAiService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  async receiveEvolutionWebhook(
    payload: EvolutionWebhookDto | Record<string, unknown>,
  ): Promise<{
    success: boolean;
    message: string;
    eventType: string;
    normalized: {
      instanceName: string | null;
      contactPhone: string | null;
      contactName: string | null;
      messageText: string | null;
      messageType: string | null;
      caption: string | null;
      mediaUrl: string | null;
      mediaId: string | null;
      deliveryStatus: string | null;
      eventAt: Date;
      conversationExternalId: string | null;
      externalMessageId: string | null;
      messageId: string | null;
    };
  }> {
    this.logger.log(`[WEBHOOK_RECEIVED] ${this.stringifyForLog(payload)}`);
    const normalized: NormalizedWebhookDto = normalizeEvolutionWebhook(payload);
    this.logger.log(
      `[WEBHOOK_NORMALIZED] ${this.stringifyForLog({
        instanceName: normalized.instanceName,
        remoteJid: normalized.conversationExternalId ?? normalized.contactPhone,
        fromMe: normalized.direction === 'outbound',
        messageId: normalized.externalMessageId,
        pushName: normalized.contactName,
        messageText: normalized.messageText ?? normalized.caption,
        messageType: normalized.messageType,
        timestamp: normalized.eventAt,
      })}`,
    );

    const missingFields = this.getMissingEvolutionFields(normalized);
    if (missingFields.length > 0) {
      const error = {
        error: 'Missing required fields',
        missingFields,
      };
      this.logger.warn(`[WEBHOOK_ERROR] ${this.stringifyForLog(error)}`);
      throw new BadRequestException(error);
    }

    const webhookLog = await this.webhooksRepository.createWebhookLog(normalized);
    this.logger.log(
      `Evolution webhook received: instanceName=${normalized.instanceName ?? 'null'} companyId=${webhookLog.companyId ?? 'null'}`,
    );

    try {
      await this.dispatch(normalized);
      await this.webhooksRepository.markProcessed(webhookLog.id);
      await this.n8nService.notifyWebhookProcessed({
        webhookEventId: webhookLog.id,
        normalized,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected webhook processing error';
      await this.webhooksRepository.markFailed(webhookLog.id, message);
      throw error;
    }

    return {
      success: true,
      message: 'Webhook processed successfully',
      eventType: normalized.eventType,
      normalized: {
        instanceName: normalized.instanceName,
        contactPhone: normalized.contactPhone,
        contactName: normalized.contactName,
        messageText: normalized.messageText,
        messageType: normalized.messageType,
        caption: normalized.caption ?? null,
        mediaUrl: normalized.mediaUrl ?? null,
        mediaId: normalized.mediaId ?? null,
        deliveryStatus: normalized.deliveryStatus,
        eventAt: normalized.eventAt,
        conversationExternalId: normalized.conversationExternalId,
        externalMessageId: normalized.externalMessageId,
        messageId: normalized.externalMessageId,
      },
    };
  }

  async findAll(query: WebhookQueryDto, actor?: AuthenticatedUser) {
    return this.webhooksRepository.findMany(query, resolveCompanyScope(actor));
  }

  async processN8nNormalizedMessage(payload: N8nNormalizedMessageDto) {
    const normalized = this.normalizeN8nPayload(payload);
    const webhookLog = await this.webhooksRepository.createWebhookLog(
      new NormalizedWebhookDto({
        eventType: normalized.inboundValid ? 'inbound_message' : 'unknown',
        provider: 'n8n',
        instanceName: normalized.instanceName,
        externalMessageId: normalized.messageId,
        conversationExternalId: normalized.rawRemoteJid,
        contactPhone: normalized.phoneNumber,
        contactName: normalized.contactName,
        messageText: normalized.messageText,
        messageType: normalized.messageType,
        caption: normalized.caption,
        mediaUrl: normalized.mediaUrl,
        mediaId: normalized.mediaId,
        mimeType: normalized.mimeType,
        deliveryStatus: null,
        direction: normalized.inboundValid ? 'inbound' : null,
        eventAt: normalized.eventAt,
        rawPayload: (payload.rawPayload ?? payload) as Record<string, unknown>,
      }),
    );

    this.logger.log(
      `n8n inbound received: instanceName=${normalized.instanceName ?? 'null'} phoneNumber=${normalized.phoneNumber ?? 'null'} rawRemoteJid=${normalized.rawRemoteJid ?? 'null'} messageId=${normalized.messageId ?? 'null'} messageType=${normalized.messageType} messageLength=${normalized.messageText.length} captionLength=${normalized.caption?.length ?? 0} inboundValid=${normalized.inboundValid}`,
    );

    try {
      const result = await this.processNormalizedInbound(normalized);
      await this.webhooksRepository.markProcessed(webhookLog.id);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected n8n processing error';
      await this.webhooksRepository.markFailed(webhookLog.id, message);
      throw error;
    }
  }

  async persistN8nNormalizedWebhook(payload: N8nNormalizedMessageDto) {
    const normalized = this.normalizeN8nPayload(payload);
    const webhookLog = await this.webhooksRepository.createWebhookLog(
      new NormalizedWebhookDto({
        eventType: normalized.inboundValid ? 'inbound_message' : 'unknown',
        provider: 'n8n',
        instanceName: normalized.instanceName,
        externalMessageId: normalized.messageId,
        conversationExternalId: normalized.rawRemoteJid,
        contactPhone: normalized.phoneNumber,
        contactName: normalized.contactName,
        messageText: normalized.messageText,
        messageType: normalized.messageType,
        caption: normalized.caption,
        mediaUrl: normalized.mediaUrl,
        mediaId: normalized.mediaId,
        mimeType: normalized.mimeType,
        deliveryStatus: null,
        direction: normalized.inboundValid ? 'inbound' : null,
        eventAt: normalized.eventAt,
        rawPayload: (payload.rawPayload ?? payload) as Record<string, unknown>,
      }),
    );

    await this.webhooksRepository.markProcessed(webhookLog.id);
    this.logger.log(
      `n8n webhook persisted: webhookEventId=${webhookLog.id} companyId=${webhookLog.companyId ?? 'null'} instanceName=${normalized.instanceName ?? 'null'} messageId=${normalized.messageId ?? 'null'} inboundValid=${normalized.inboundValid}`,
    );

    return {
      success: true,
      webhookEventId: webhookLog.id,
      companyId: webhookLog.companyId ?? null,
      inboundValid: normalized.inboundValid,
      eventType: normalized.inboundValid ? 'inbound_message' : 'unknown',
      instanceName: normalized.instanceName,
      phoneNumber: normalized.phoneNumber,
      rawRemoteJid: normalized.rawRemoteJid,
      contactName: normalized.contactName,
      messageText: normalized.messageText,
      messageType: normalized.messageType,
      caption: normalized.caption,
      mediaUrl: normalized.mediaUrl,
      mediaId: normalized.mediaId,
      mimeType: normalized.mimeType,
      messageId: normalized.messageId,
      eventAt: normalized.eventAt.toISOString(),
    };
  }

  private async processNormalizedInbound(normalized: {
    inboundValid: boolean;
    instanceName: string | null;
    phoneNumber: string | null;
    rawRemoteJid: string | null;
    businessPhoneNumber: string | null;
    contactName: string | null;
    messageText: string;
    caption: string | null;
    messageType: string;
    hasMedia?: boolean;
    mediaType?: string | null;
    mediaUrl?: string | null;
    mediaId?: string | null;
    mimeType?: string | null;
    messageId: string | null;
    eventAt: Date;
    rawPayload: Record<string, unknown>;
  }) {
    if (!normalized.inboundValid) {
      return this.buildN8nResponse({
        shouldSendMessage: false,
        replyText: '',
        reason: 'ignored_non_inbound_or_invalid_message',
        botPaused: false,
        handoffRequired: false,
        instanceName: normalized.instanceName,
        phoneNumber: normalized.phoneNumber,
      });
    }

    const company = await this.resolveCompanyForInbound(normalized);
    if (!company) {
      this.logger.warn(
        `n8n inbound ignored: company not resolved instance=${normalized.instanceName ?? 'null'} businessPhone=${normalized.businessPhoneNumber ?? 'null'}`,
      );
      return this.buildN8nResponse({
        shouldSendMessage: false,
        replyText: '',
        reason: 'company_not_resolved',
        botPaused: false,
        handoffRequired: false,
        instanceName: normalized.instanceName,
        phoneNumber: normalized.phoneNumber,
        evolutionConfigured: false,
      });
    }

    this.logger.log(
      `n8n company detected: companyId=${company.companyId} instanceName=${company.instanceName ?? 'null'} evolutionConfigured=${company.evolutionConfigured}`,
    );

    const phoneCandidates = this.normalizePhoneCandidates(
      normalized.phoneNumber,
      normalized.rawRemoteJid,
    );

    if (!phoneCandidates.length) {
      return this.buildN8nResponse({
        companyId: company.companyId,
        shouldSendMessage: false,
        replyText: '',
        reason: 'phone_number_required',
        botPaused: false,
        handoffRequired: false,
        instanceName: company.instanceName,
        phoneNumber: normalized.phoneNumber,
        evolutionConfigured: company.evolutionConfigured,
      });
    }

    const duplicate = normalized.messageId
      ? await this.prismaSafeDuplicateCheck({
          companyId: company.companyId,
          messageId: normalized.messageId,
        })
      : null;

    if (duplicate) {
      this.logger.log(
        `n8n duplicate inbound skipped: companyId=${company.companyId} conversationId=${duplicate.conversationId} externalId=${normalized.messageId}`,
      );
      return this.buildN8nResponse({
        companyId: company.companyId,
        conversationId: duplicate.conversationId,
        contactId: duplicate.contactId ?? null,
        inboundMessageId: duplicate.id,
        shouldSendMessage: false,
        replyText: '',
        reason: 'duplicate_inbound_message',
        botPaused: false,
        handoffRequired: false,
        duplicate: true,
        instanceName: company.instanceName,
        phoneNumber: phoneCandidates[0],
        evolutionConfigured: company.evolutionConfigured,
      });
    }

    const state = await this.ensureInboundConversation({
      companyId: company.companyId,
      phoneCandidates,
      contactName: normalized.contactName,
      eventAt: normalized.eventAt,
      messageText: normalized.messageText,
      caption: normalized.caption,
      messageType: normalized.messageType,
      mediaUrl: normalized.mediaUrl,
      mediaId: normalized.mediaId,
      mimeType: normalized.mimeType,
      messageId: normalized.messageId,
      rawPayload: normalized.rawPayload,
    });

    this.logger.log(
      `n8n inbound stored: companyId=${company.companyId} contactId=${state.contact.id} conversationId=${state.conversation.id} messageId=${state.message.id}`,
    );

    const botPaused = state.conversation.botPaused === true;
    const humanAssigned = this.hasHumanAssignment(state.conversation);
    const handoffPending = state.conversation.handoffRequired === true;
    const automationBlocked =
      botPaused ||
      humanAssigned;
    const aiEnabled = await this.isCompanyAiEnabled(company.companyId);

    this.logger.log(
      `n8n automation state: conversationId=${state.conversation.id} botPaused=${botPaused} humanAssigned=${humanAssigned} handoffRequired=${handoffPending} assignedTo=${state.conversation.assignedTo ?? 'null'} aiEnabled=${aiEnabled}`,
    );

    if (automationBlocked || !aiEnabled) {
      const blockReason = !aiEnabled
        ? 'ai_disabled'
        : botPaused
          ? 'bot_paused'
          : 'human_takeover_active';

      await this.notifyInternalHandoff({
        companyId: company.companyId,
        conversationId: state.conversation.id,
        contactId: state.contact.id,
        reason: blockReason,
      });

      return this.buildN8nResponse({
        companyId: company.companyId,
        conversationId: state.conversation.id,
        contactId: state.contact.id,
        inboundMessageId: state.message.id,
        shouldSendMessage: false,
        replyText: '',
        reason: blockReason,
        botPaused,
        humanAssigned,
        handoffRequired: handoffPending || automationBlocked,
        instanceName: company.instanceName,
        phoneNumber: phoneCandidates[0],
        evolutionConfigured: company.evolutionConfigured,
      });
    }

    const aiReply = await this.aiService.generateReply({
      message:
        normalized.messageType === 'image'
          ? (normalized.caption ?? normalized.messageText)
          : normalized.messageText,
      messageId: state.message.id,
      conversationId: state.conversation.id,
      companyId: company.companyId,
      contactId: state.contact.id,
      contactName: state.contact.fullName ?? state.contact.whatsappName ?? undefined,
      channel: 'whatsapp',
      direction: 'inbound',
      messageType: normalized.messageType,
      caption: normalized.caption,
      phoneNumber: phoneCandidates[0],
      instanceName: company.instanceName ?? normalized.instanceName ?? undefined,
      hasMedia: normalized.hasMedia ?? false,
      mediaType: normalized.mediaType ?? null,
      mediaUrl: normalized.mediaUrl ?? null,
      mediaId: normalized.mediaId ?? null,
      mimeType: normalized.mimeType ?? null,
      rawPayload: normalized.rawPayload,
      lastCustomerMessageAt: normalized.eventAt.toISOString(),
    });

    this.logger.log(
      `n8n AI decision: conversationId=${state.conversation.id} intent=${aiReply.intent} importance=${aiReply.importance} source=${aiReply.source} canAnswer=${aiReply.canAnswer} handoffRequired=${aiReply.handoffRequired} canSendFreeForm=${aiReply.canSendFreeForm} reason=${aiReply.reason ?? 'null'} replyText="${this.truncateForLog(aiReply.replyText ?? aiReply.reply ?? '', 180)}" replyLength=${aiReply.reply.length} answerLength=${aiReply.answer.length} aiRunId=${aiReply.aiRunId ?? 'null'}`,
    );

    const geminiReturnedText = Boolean(
      aiReply.replyText?.trim() || aiReply.reply.trim(),
    );
    const replyText = (
      aiReply.replyText ||
      aiReply.reply ||
      ''
    ).trim();
    const shouldSendAiReply =
      aiReply.shouldSendMessage === true &&
      !aiReply.handoffRequired &&
      aiReply.canSendFreeForm !== false &&
      replyText.length > 0;

    this.logger.log(
      `n8n send decision: conversationId=${state.conversation.id} geminiReturnedText=${geminiReturnedText} replyTextLength=${replyText.length} shouldSend=${shouldSendAiReply} blockReason=${shouldSendAiReply ? 'null' : (aiReply.reason ?? 'ai_no_reply')}`,
    );

    if (shouldSendAiReply) {
      return this.buildN8nResponse({
        companyId: company.companyId,
        conversationId: state.conversation.id,
        contactId: state.contact.id,
        inboundMessageId: state.message.id,
        shouldSendMessage: true,
        replyText,
        reason: aiReply.reason ?? 'ai_reply_ready',
        botPaused: false,
        humanAssigned: false,
        handoffRequired: false,
        aiRunId: aiReply.aiRunId,
        instanceName: company.instanceName,
        phoneNumber: phoneCandidates[0],
        geminiReturnedText,
        ragSourcesFound: Boolean(aiReply.metadata?.ragSourcesFound),
        evolutionConfigured: company.evolutionConfigured,
        provider: aiReply.provider,
        model: aiReply.model,
        intent: aiReply.intent,
        importance: aiReply.importance,
        source: aiReply.source,
        sources: aiReply.sources,
        tagsToApply: aiReply.tagsToApply,
        needsClarification: aiReply.needsClarification,
        canAnswer: aiReply.canAnswer,
        confidence: aiReply.confidence,
        normalizedMessage: aiReply.normalizedMessage,
        detectedLanguage: aiReply.detectedLanguage,
        needsRag: aiReply.needsRag,
        orderIntent: aiReply.orderIntent,
        orderDetails: aiReply.orderDetails,
        keywordsForSearch: aiReply.keywordsForSearch,
      });
    }

    if (aiReply.handoffRequired) {
      await this.notifyInternalHandoff({
        companyId: company.companyId,
        conversationId: state.conversation.id,
        contactId: state.contact.id,
        reason: aiReply.reason ?? 'ai_handoff_required',
      });

      const shouldSendHandoffNotice =
        aiReply.shouldSendMessage === true &&
        aiReply.canSendFreeForm !== false &&
        replyText.length > 0;

      return this.buildN8nResponse({
        companyId: company.companyId,
        conversationId: state.conversation.id,
        contactId: state.contact.id,
        inboundMessageId: state.message.id,
        shouldSendMessage: shouldSendHandoffNotice,
        replyText: shouldSendHandoffNotice ? replyText : '',
        reason: aiReply.reason ?? 'ai_handoff_required',
        botPaused: false,
        humanAssigned: false,
        handoffRequired: true,
        aiRunId: aiReply.aiRunId,
        instanceName: company.instanceName,
        phoneNumber: phoneCandidates[0],
        geminiReturnedText,
        ragSourcesFound: Boolean(aiReply.metadata?.ragSourcesFound),
        evolutionConfigured: company.evolutionConfigured,
        provider: aiReply.provider,
        model: aiReply.model,
        intent: aiReply.intent,
        importance: aiReply.importance,
        source: aiReply.source,
        sources: aiReply.sources,
        tagsToApply: aiReply.tagsToApply,
        needsClarification: aiReply.needsClarification,
        canAnswer: aiReply.canAnswer,
        confidence: aiReply.confidence,
        normalizedMessage: aiReply.normalizedMessage,
        detectedLanguage: aiReply.detectedLanguage,
        needsRag: aiReply.needsRag,
        orderIntent: aiReply.orderIntent,
        orderDetails: aiReply.orderDetails,
        keywordsForSearch: aiReply.keywordsForSearch,
      });
    }

    return this.buildN8nResponse({
      companyId: company.companyId,
      conversationId: state.conversation.id,
      contactId: state.contact.id,
      inboundMessageId: state.message.id,
      shouldSendMessage: false,
      replyText: '',
      reason: aiReply.reason ?? 'ai_no_reply',
      botPaused: false,
      humanAssigned: false,
      handoffRequired: false,
      aiRunId: aiReply.aiRunId,
      instanceName: company.instanceName,
      phoneNumber: phoneCandidates[0],
      geminiReturnedText,
      ragSourcesFound: Boolean(aiReply.metadata?.ragSourcesFound),
      evolutionConfigured: company.evolutionConfigured,
      provider: aiReply.provider,
      model: aiReply.model,
      intent: aiReply.intent,
      importance: aiReply.importance,
      source: aiReply.source,
      sources: aiReply.sources,
      tagsToApply: aiReply.tagsToApply,
      needsClarification: aiReply.needsClarification,
      canAnswer: aiReply.canAnswer,
      confidence: aiReply.confidence,
      normalizedMessage: aiReply.normalizedMessage,
      detectedLanguage: aiReply.detectedLanguage,
      needsRag: aiReply.needsRag,
      orderIntent: aiReply.orderIntent,
      orderDetails: aiReply.orderDetails,
      keywordsForSearch: aiReply.keywordsForSearch,
    });
  }

  private async dispatch(payload: NormalizedWebhookDto): Promise<void> {
    switch (payload.eventType) {
      case 'inbound_message':
        await this.inboundMessagesHandler.handle(payload);
        return;

      case 'delivery_status':
        await this.deliveryStatusHandler.handle(payload);
        return;

      case 'conversation_event':
        await this.conversationEventsHandler.handle(payload);
        return;

      default:
        this.logger.warn(`Unhandled webhook event type: ${payload.eventType}`);
        return;
    }
  }

  private normalizeN8nPayload(payload: N8nNormalizedMessageDto) {
    const messageText = (
      payload.messageText ??
      payload.content ??
      payload.text ??
      ''
    ).trim();
    const caption = this.normalizeNullableString(payload.caption);
    const instanceName = this.normalizeNullableString(
      payload.instanceName ?? payload.instance,
    );
    const phoneNumber = this.normalizeNullableString(
      payload.phoneNumber ?? payload.contactPhone,
    );
    const rawRemoteJid = this.normalizeNullableString(payload.rawRemoteJid);
    const mediaUrl = this.normalizeNullableString(payload.mediaUrl);
    const mediaId = this.normalizeNullableString(payload.mediaId);
    const mimeType = this.normalizeNullableString(payload.mimeType);
    const messageType =
      payload.messageType?.trim() || (mediaUrl || mediaId ? 'image' : 'text');
    const hasMedia =
      payload.hasMedia === true ||
      ['image', 'audio', 'video', 'document'].includes(messageType);
    const inboundValid =
      payload.inboundValid !== false &&
      (messageText.length > 0 || Boolean(caption) || hasMedia) &&
      Boolean(phoneNumber || rawRemoteJid);

    return {
      inboundValid,
      instanceName,
      phoneNumber,
      rawRemoteJid,
      businessPhoneNumber: this.normalizeNullableString(
        payload.businessPhoneNumber,
      ),
      contactName: this.normalizeNullableString(payload.contactName),
      messageText,
      caption,
      messageType,
      hasMedia,
      mediaType:
        this.normalizeNullableString(payload.mediaType) ??
        (messageType === 'image' ? 'image' : null),
      mediaUrl,
      mediaId,
      mimeType,
      messageId: this.normalizeNullableString(payload.messageId),
      eventAt: this.parseEventDate(payload.eventAt),
      rawPayload: (payload.rawPayload ?? payload) as Record<string, unknown>,
    };
  }

  private getMissingEvolutionFields(payload: NormalizedWebhookDto): string[] {
    if (payload.eventType !== 'inbound_message') {
      return [];
    }

    const missingFields: string[] = [];
    const hasMessageContent = Boolean(
      payload.messageText?.trim() ||
        payload.caption?.trim() ||
        payload.mediaUrl ||
        payload.mediaId,
    );

    if (!payload.instanceName?.trim()) {
      missingFields.push('instanceName');
    }

    if (
      !payload.conversationExternalId?.trim() &&
      !payload.contactPhone?.trim()
    ) {
      missingFields.push('remoteJid');
    }

    if (!hasMessageContent) {
      missingFields.push('messageText');
    }

    return missingFields;
  }

  private async findWhatsappInstanceByName(instanceName: string) {
    const candidates = buildEvolutionInstanceLookupCandidates(instanceName);
    const exact = candidates.length
      ? await this.prisma.companyWhatsappInstance.findFirst({
          where: {
            OR: candidates.map((candidate) => ({
              evolutionInstanceName: candidate,
            })),
          },
          select: {
            companyId: true,
            evolutionInstanceName: true,
            apiBaseUrl: true,
            apiKey: true,
            company: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (exact) {
      return exact;
    }

    const instances = await this.prisma.companyWhatsappInstance.findMany({
      select: {
        companyId: true,
        evolutionInstanceName: true,
        apiBaseUrl: true,
        apiKey: true,
        company: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return findMatchingEvolutionInstance(instances, instanceName);
  }

  private async resolveCompanyForInbound(normalized: {
    instanceName: string | null;
    businessPhoneNumber: string | null;
  }) {
    if (normalized.instanceName) {
      const instance = await this.findWhatsappInstanceByName(
        normalized.instanceName,
      );

      if (instance?.companyId) {
        this.logger.log(
          `[INSTANCE_FOUND] instanceName=${normalized.instanceName} mappedInstance=${instance.evolutionInstanceName}`,
        );
        this.logger.log(
          `[COMPANY_FOUND] companyId=${instance.companyId} companyName=${instance.company?.name ?? 'unknown'}`,
        );

        return {
          companyId: instance.companyId,
          instanceName: instance.evolutionInstanceName,
          evolutionConfigured: this.isEvolutionConfigured(instance),
        };
      }

      this.logger.warn(
        `[WEBHOOK_ERROR] Instance not mapped to company instanceName=${normalized.instanceName}`,
      );
    }

    const phoneCandidates = this.normalizePhoneCandidates(
      normalized.businessPhoneNumber,
      normalized.businessPhoneNumber,
    );

    if (!phoneCandidates.length) {
      return null;
    }

    const instances = await this.prisma.companyWhatsappInstance.findMany({
      where: {
        OR: phoneCandidates.map((phone) => ({ whatsappNumber: phone })),
      },
      select: {
        companyId: true,
        evolutionInstanceName: true,
        apiBaseUrl: true,
        apiKey: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 2,
    });

    if (instances.length !== 1) {
      if (instances.length > 1) {
        this.logger.warn(
          `n8n inbound rejected: ambiguous business phone mapping phone=${normalized.businessPhoneNumber}`,
        );
      }
      return null;
    }

    const instance = instances[0];
    return instance?.companyId
      ? {
          companyId: instance.companyId,
          instanceName: instance.evolutionInstanceName,
          evolutionConfigured: this.isEvolutionConfigured(instance),
        }
      : null;
  }

  private async prismaSafeDuplicateCheck(params: {
    companyId: string;
    messageId: string;
  }) {
    return this.prisma.message.findFirst({
      where: {
        companyId: params.companyId,
        externalMessageId: params.messageId,
        direction: 'inbound',
      },
      select: {
        id: true,
        conversationId: true,
        conversation: {
          select: {
            contactId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }).then((message) =>
      message
        ? {
            id: message.id,
            conversationId: message.conversationId,
            contactId: message.conversation.contactId,
          }
        : null,
    );
  }

  private async ensureInboundConversation(params: {
    companyId: string;
    phoneCandidates: string[];
    contactName: string | null;
    eventAt: Date;
    messageText: string;
    caption: string | null;
    messageType: string;
    mediaUrl?: string | null;
    mediaId?: string | null;
    mimeType?: string | null;
    messageId: string | null;
    rawPayload: Record<string, unknown>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      let contact = await tx.contact.findFirst({
        where: {
          companyId: params.companyId,
          OR: params.phoneCandidates.map((phone) => ({ phone })),
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (contact) {
        contact = await tx.contact.update({
          where: { id: contact.id },
          data: {
            phone: contact.phone ?? params.phoneCandidates[0],
            fullName: params.contactName ?? contact.fullName,
            whatsappName: params.contactName ?? contact.whatsappName,
            lastSeen: params.eventAt,
            updatedAt: new Date(),
          },
        });
      } else {
        contact = await tx.contact.create({
          data: {
            companyId: params.companyId,
            phone: params.phoneCandidates[0],
            whatsappName: params.contactName ?? 'Client',
            fullName: params.contactName ?? 'Client',
            email: null,
            language: null,
            city: null,
            country: null,
            tags: [],
            notes: null,
            segment: null,
            source: 'n8n_evolution_webhook',
            status: 'active',
            lastSeen: params.eventAt,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      let conversation = await tx.conversation.findFirst({
        where: {
          companyId: params.companyId,
          contactId: contact.id,
          status: { not: 'closed' },
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            companyId: params.companyId,
            contactId: contact.id,
            channel: 'whatsapp',
            status: 'bot_active',
            priority: 'medium',
            assignedTo: null,
            botPaused: false,
            handoffRequired: false,
            unreadCount: 0,
            lastMessageAt: params.eventAt,
            lastCustomerMessageAt: params.eventAt,
            lastBotMessageAt: null,
            lastHumanMessageAt: null,
            closedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      const message = await tx.message.create({
        data: {
          companyId: params.companyId,
          conversationId: conversation.id,
          externalMessageId: params.messageId,
          direction: 'inbound',
          senderType: 'customer',
          content: params.caption ?? params.messageText,
          messageType: params.messageType,
          caption: params.caption,
          mediaId: params.mediaId ?? null,
          mediaUrl: params.mediaUrl ?? null,
          mimeType: params.mimeType ?? null,
          rawPayload: params.rawPayload as Prisma.InputJsonValue,
          deliveryStatus: 'delivered',
          errorMessage: null,
          createdAt: params.eventAt,
          messageTimestamp: params.eventAt,
        },
      });

      const shouldResumeAiAutomation =
        conversation.status === 'human_assigned' &&
        !conversation.assignedTo &&
        conversation.handoffRequired === true;

      conversation = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          unreadCount: { increment: 1 },
          status: shouldResumeAiAutomation ? 'waiting_customer' : undefined,
          botPaused: shouldResumeAiAutomation ? false : undefined,
          lastMessageAt: params.eventAt,
          lastCustomerMessageAt: params.eventAt,
          updatedAt: new Date(),
        },
      });

      return {
        contact,
        conversation,
        message,
      };
    });
  }

  private hasHumanAssignment(conversation: {
    assignedTo: string | null;
    status: string | null;
  }) {
    return conversation.status === 'human_assigned' || Boolean(conversation.assignedTo);
  }

  private isEvolutionConfigured(instance: {
    evolutionInstanceName: string | null;
    apiBaseUrl: string | null;
    apiKey: string | null;
  }) {
    return Boolean(
      instance.evolutionInstanceName?.trim() &&
        (instance.apiBaseUrl?.trim() || process.env.EVOLUTION_API_URL?.trim()) &&
        (instance.apiKey?.trim() || process.env.EVOLUTION_API_KEY?.trim()),
    );
  }

  private async isCompanyAiEnabled(companyId: string) {
    const key = `company_settings_v2:${companyId}`;
    const setting = await this.prisma.setting.findFirst({
      where: {
        companyId,
        key,
      },
      select: {
        value: true,
      },
    });

    const value = this.asRecord(setting?.value);
    const aiPolicy = this.asRecord(value.aiPolicy);

    return aiPolicy.enabled !== false;
  }

  private async notifyInternalHandoff(params: {
    companyId: string;
    conversationId: string;
    contactId: string;
    reason: string;
  }) {
    const existing = await this.prisma.notification.findFirst({
      where: {
        companyId: params.companyId,
        conversationId: params.conversationId,
        isRead: false,
        type: {
          in: [
            NotificationType.HANDOFF_REQUIRED,
            NotificationType.CUSTOMER_REQUEST_HUMAN,
            NotificationType.AI_LOW_CONFIDENCE,
          ],
        },
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    await this.notificationsService.create({
      companyId: params.companyId,
      conversationId: params.conversationId,
      contactId: params.contactId,
      type: NotificationType.HANDOFF_REQUIRED,
      title: 'Conversation a traiter',
      message: `Une conversation WhatsApp necessite une intervention interne. Raison: ${params.reason}.`,
      priority: NotificationPriority.high,
      isRead: false,
    });
  }

  private buildN8nResponse(params: {
    companyId?: string | null;
    conversationId?: string | null;
    contactId?: string | null;
    inboundMessageId?: string | null;
    shouldSendMessage: boolean;
    replyText: string;
    reason: string;
    botPaused: boolean;
    humanAssigned?: boolean;
    handoffRequired: boolean;
    duplicate?: boolean;
    aiRunId?: string | null;
    instanceName?: string | null;
    phoneNumber?: string | null;
    geminiReturnedText?: boolean;
    ragSourcesFound?: boolean;
    evolutionConfigured?: boolean;
    provider?: string | null;
    model?: string | null;
    intent?: string | null;
    importance?: string | null;
    source?: string | null;
    sources?: string[];
    tagsToApply?: string[];
    needsClarification?: boolean;
    canAnswer?: boolean;
    confidence?: number;
    normalizedMessage?: string;
    detectedLanguage?: string;
    needsRag?: boolean;
    orderIntent?: boolean;
    orderDetails?: AiReplyResponseDto['orderDetails'];
    keywordsForSearch?: string[];
  }) {
    const finalReplyText = params.replyText.trim();
    const shouldSend = params.shouldSendMessage && finalReplyText.length > 0;
    const blockReason = shouldSend ? null : params.reason;
    const humanAssigned = params.humanAssigned ?? false;
    const canAnswer = params.canAnswer ?? (shouldSend && !params.handoffRequired);

    this.logger.log(
      `n8n response: conversationId=${params.conversationId ?? 'null'} messageId=${params.inboundMessageId ?? 'null'} intent=${params.intent ?? 'null'} importance=${params.importance ?? 'null'} source=${params.source ?? 'null'} shouldSend=${shouldSend} replyText="${this.truncateForLog(shouldSend ? finalReplyText : '', 180)}" replyTextLength=${shouldSend ? finalReplyText.length : 0} handoffRequired=${params.handoffRequired} botPaused=${params.botPaused} humanAssigned=${humanAssigned} blockReason=${blockReason ?? 'null'} instanceName=${params.instanceName ?? 'null'} phoneNumber=${params.phoneNumber ?? 'null'}`,
    );

    return {
      success: true,
      shouldSend,
      shouldSendMessage: shouldSend,
      canAnswer,
      normalizedMessage: params.normalizedMessage ?? '',
      detectedLanguage: params.detectedLanguage ?? 'unknown',
      needsRag: params.needsRag ?? false,
      orderIntent: params.orderIntent ?? false,
      orderDetails: params.orderDetails ?? null,
      keywordsForSearch: params.keywordsForSearch ?? [],
      replyText: shouldSend ? finalReplyText : '',
      handoffRequired: params.handoffRequired,
      needsClarification: params.needsClarification ?? false,
      blockReason,
      conversationId: params.conversationId ?? null,
      companyId: params.companyId ?? null,
      contactId: params.contactId ?? null,
      messageId: params.inboundMessageId ?? null,
      inboundMessageId: params.inboundMessageId ?? null,
      botPaused: params.botPaused,
      humanAssigned,
      duplicate: params.duplicate ?? false,
      reason: params.reason,
      provider: params.provider ?? null,
      model: params.model ?? null,
      intent: params.intent ?? null,
      importance: params.importance ?? null,
      source: params.source ?? null,
      sources: params.sources ?? [],
      tagsToApply: params.tagsToApply ?? [],
      confidence: params.confidence ?? 0,
      aiRunId: params.aiRunId ?? null,
      instance: params.instanceName ?? null,
      instanceName: params.instanceName ?? null,
      phoneNumber: params.phoneNumber ?? null,
      debug: {
        geminiReturnedText:
          params.geminiReturnedText ?? Boolean(finalReplyText.length),
        ragSourcesFound: params.ragSourcesFound ?? false,
        botPaused: params.botPaused,
        humanAssigned,
        evolutionConfigured: params.evolutionConfigured ?? false,
        apiKeyAccepted: true,
        canAnswer,
        needsClarification: params.needsClarification ?? false,
        shouldSend,
        blockReason,
      },
    };
  }

  private stringifyForLog(value: unknown, maxLength = 4000): string {
    try {
      const serialized = JSON.stringify(value);
      if (!serialized) {
        return 'null';
      }

      return serialized.length > maxLength
        ? `${serialized.slice(0, maxLength)}...`
        : serialized;
    } catch {
      return '[unserializable payload]';
    }
  }

  private truncateForLog(value: string, maxLength = 500): string {
    const compact = value.replace(/\s+/g, ' ').trim();

    return compact.length > maxLength
      ? `${compact.slice(0, maxLength)}...`
      : compact;
  }

  private normalizePhoneCandidates(
    phoneNumber?: string | null,
    rawRemoteJid?: string | null,
  ): string[] {
    const rawValues = [phoneNumber, rawRemoteJid]
      .filter((value): value is string => typeof value === 'string')
      .map((value) =>
        value.replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '').trim(),
      )
      .filter(Boolean);

    const candidates = new Set<string>();

    for (const rawValue of rawValues) {
      const cleaned = rawValue.replace(/[^0-9+]/g, '');
      if (!cleaned) continue;

      let normalized = cleaned.startsWith('00')
        ? `+${cleaned.slice(2)}`
        : cleaned;

      if (normalized.startsWith('+')) {
        candidates.add(normalized);
      } else {
        candidates.add(normalized);
        candidates.add(`+${normalized}`);
      }

      const digitsOnly = normalized.replace(/\D/g, '');
      if (digitsOnly) {
        candidates.add(digitsOnly);
        candidates.add(`+${digitsOnly}`);
      }
    }

    return Array.from(candidates);
  }

  private parseEventDate(value?: string | number | null): Date {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value > 1_000_000_000_000 ? value : value * 1000);
    }

    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);

      if (Number.isFinite(numeric)) {
        return new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000);
      }

      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed);
      }
    }

    return new Date();
  }

  private normalizeNullableString(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}
