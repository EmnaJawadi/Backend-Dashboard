import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import {
  buildEvolutionInstanceLookupCandidates,
  findMatchingEvolutionInstance,
} from '../../common/utils/evolution-instance.util';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  EvolutionApiClient,
  EvolutionApiRequestError,
} from '../../integrations/whatsapp/evolution-api.client';
import { WhatsappProviderService } from '../../integrations/whatsapp/whatsapp-provider.interface';
import {
  CompanyWhatsappConnectDto,
  UpdateCompanyWhatsappInstanceDto,
} from './dto/company-whatsapp-instance.dto';
import { ReplyWhatsappDto } from './dto/reply-whatsapp.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { ConversationWindowService } from './policies/conversation-window.service';
import { WhatsappComplianceService } from './policies/whatsapp-compliance.service';

type WhatsappConversationContext = {
  id: string;
  companyId: string | null;
  assignedTo: string | null;
  status: string | null;
  botPaused: boolean | null;
  handoffRequired: boolean | null;
  lastCustomerMessageAt: Date | null;
  contact: {
    phone: string | null;
  } | null;
};

type ResolvedEvolutionInstance = {
  instanceName: string | null;
  apiBaseUrl: string | null;
  apiKey: string | null;
};

type CompanyWhatsappInstanceConfig = {
  companyId: string;
  evolutionInstanceName: string;
  apiBaseUrl: string | null;
  apiKey: string | null;
};

type WhatsappSenderType = 'human' | 'human_agent' | 'agent' | 'bot' | 'system';
type StoredWhatsappSenderType = 'human_agent' | 'bot' | 'system';
type FrontendWhatsappConnectionStatus = 'connected' | 'disconnected' | 'pending';

const TECHNICAL_WHATSAPP_FIELDS = [
  'apiBaseUrl',
  'apiKey',
  'phoneNumberId',
  'businessAccountId',
] as const;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolutionApiClient: EvolutionApiClient,
    private readonly whatsappProviderService: WhatsappProviderService,
    private readonly conversationWindowService: ConversationWindowService,
    private readonly whatsappComplianceService: WhatsappComplianceService,
  ) {}

  async reply(replyWhatsappDto: ReplyWhatsappDto, actor?: AuthenticatedUser) {
    const companyScope = resolveCompanyScope(actor);
    const conversation = replyWhatsappDto.conversationId
      ? await this.findConversationContext(
          replyWhatsappDto.conversationId,
          companyScope,
        )
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
        kbSuggestionId: null,
      };
    }

    const phoneNumber = this.resolvePhoneNumber(
      replyWhatsappDto.phoneNumber,
      conversation,
    );
    const message = this.whatsappComplianceService.validateMessageContent(
      replyWhatsappDto.message,
    );
    const instance = await this.resolveInstanceConfig({
      companyId: conversation?.companyId ?? companyScope ?? null,
      providedInstance: replyWhatsappDto.instanceName,
    });

    return this.sendText({
      phoneNumber,
      message,
      conversation,
      senderType: this.normalizeSenderType(replyWhatsappDto.senderType ?? 'bot'),
      senderId: replyWhatsappDto.senderId,
      instance,
      action: 'sent_free_form',
    });
  }

  async sendMessage(
    sendWhatsappMessageDto: SendWhatsappMessageDto,
    actor?: AuthenticatedUser,
  ) {
    const companyScope = resolveCompanyScope(actor);
    const conversation = sendWhatsappMessageDto.conversationId
      ? await this.findConversationContext(
          sendWhatsappMessageDto.conversationId,
          companyScope,
        )
      : null;

    const phoneNumber = this.resolvePhoneNumber(
      sendWhatsappMessageDto.phoneNumber,
      conversation,
    );
    const message = this.whatsappComplianceService.validateMessageContent(
      sendWhatsappMessageDto.message,
    );
    const instance = await this.resolveInstanceConfig({
      companyId: conversation?.companyId ?? companyScope ?? null,
      providedInstance: sendWhatsappMessageDto.instanceName,
    });

    return this.sendText({
      phoneNumber,
      message,
      conversation,
      senderType: this.normalizeSenderType(
        sendWhatsappMessageDto.senderType ?? 'bot',
      ),
      senderId: sendWhatsappMessageDto.senderId,
      instance,
      action: 'sent_free_form',
    });
  }

  async sendWorkflowMessage(params: {
    conversationId?: string | null;
    phoneNumber?: string;
    message: string;
    instanceName?: string;
    senderType?: WhatsappSenderType;
  }) {
    const conversation = params.conversationId
      ? await this.findConversationContext(params.conversationId)
      : null;
    const senderType = this.normalizeSenderType(params.senderType ?? 'bot');

    if (senderType === 'bot' && this.isHumanTakeoverActive(conversation)) {
      this.logger.warn(
        `WHATSAPP_REPLY_SKIPPED conversationId=${conversation?.id ?? params.conversationId ?? 'null'} reason=human_handoff_active`,
      );
      return {
        success: false,
        sent: false,
        skipped: true,
        action: 'skipped',
        canSendFreeForm: false,
        reason: 'HUMAN_HANDOFF_ACTIVE',
        message: 'Automatic reply blocked while a human handoff is active.',
        messageType: null,
        messageId: null,
        storedMessageId: null,
        instanceName: params.instanceName ?? null,
        kbSuggestionId: null,
      };
    }
    if (!params.message?.trim()) {
      this.logger.warn(
        `WHATSAPP_REPLY_SKIPPED conversationId=${conversation?.id ?? params.conversationId ?? 'null'} reason=empty_reply_text`,
      );
      return {
        success: false,
        sent: false,
        skipped: true,
        action: 'skipped',
        canSendFreeForm: true,
        reason: 'EMPTY_REPLY_TEXT',
        message: 'Reply text is empty.',
        messageType: null,
        messageId: null,
        storedMessageId: null,
        instanceName: params.instanceName ?? null,
        kbSuggestionId: null,
      };
    }

    const phoneNumber = this.resolvePhoneNumber(params.phoneNumber, conversation);
    const message = this.whatsappComplianceService.validateMessageContent(
      params.message,
    );
    const instance = await this.resolveInstanceConfig({
      companyId: conversation?.companyId ?? null,
      providedInstance: params.instanceName,
    });

    return this.sendText({
      phoneNumber,
      message,
      conversation,
      senderType,
      instance,
      action: 'sent_free_form',
    });
  }

  private async sendText(params: {
    phoneNumber: string;
    message: string;
    conversation: WhatsappConversationContext | null;
    senderType: StoredWhatsappSenderType;
    senderId?: string | null;
    instance: ResolvedEvolutionInstance;
    action: 'sent_free_form';
  }) {
    const windowStatus = this.conversationWindowService.checkWindow(
      params.conversation?.lastCustomerMessageAt,
    );

    if (params.conversation && !windowStatus.canSendFreeForm) {
      this.logger.warn(
        `WHATSAPP_REPLY_SKIPPED conversationId=${params.conversation.id} reason=${windowStatus.reason ?? 'whatsapp_window_closed'} action=blocked_free_form_send`,
      );
      return {
        success: false,
        sent: false,
        skipped: true,
        action: 'skipped',
        canSendFreeForm: false,
        reason: windowStatus.reason ?? 'WHATSAPP_WINDOW_CLOSED',
        message: 'The WhatsApp customer service window is closed.',
        messageType: null,
        messageId: null,
        storedMessageId: null,
        instanceName: params.instance.instanceName,
        kbSuggestionId: null,
      };
    }

    if (!params.instance.instanceName) {
      this.logger.warn(
        `WHATSAPP_REPLY_SKIPPED conversationId=${params.conversation?.id ?? 'null'} reason=missing_whatsapp_send_target`,
      );
      throw new BadRequestException({
        code: 'EVOLUTION_INSTANCE_NOT_CONFIGURED',
        message:
          'No Evolution instance is linked to this company yet. Connect WhatsApp first.',
      });
    }

    const duplicateReply = await this.findRecentDuplicateBotReply({
      conversationId: params.conversation?.id ?? null,
      senderType: params.senderType,
      content: params.message,
    });

    if (duplicateReply) {
      this.logger.warn(
        `WHATSAPP_REPLY_SKIPPED conversationId=${params.conversation?.id ?? 'null'} reason=duplicate_reply_recent previousMessageId=${duplicateReply.id}`,
      );
      return {
        success: false,
        sent: false,
        skipped: true,
        action: 'skipped',
        canSendFreeForm: true,
        reason: 'DUPLICATE_REPLY_RECENT',
        message: 'Duplicate bot reply skipped.',
        messageType: 'text',
        messageId: null,
        storedMessageId: duplicateReply.id,
        instanceName: params.instance.instanceName,
        kbSuggestionId: null,
      };
    }

    this.logger.log(
      `Evolution sendText call: conversationId=${params.conversation?.id ?? 'null'} instance=${params.instance.instanceName} phoneNumber=${params.phoneNumber} textLength=${params.message.length} companyConfig=${Boolean(params.instance.apiBaseUrl || params.instance.apiKey)}`,
    );

    let providerResult: Awaited<
      ReturnType<WhatsappProviderService['sendTextMessage']>
    >;
    try {
      providerResult = await this.whatsappProviderService.sendTextMessage({
        to: params.phoneNumber,
        text: params.message,
        instanceName: params.instance.instanceName,
        apiBaseUrl: params.instance.apiBaseUrl,
        apiKey: params.instance.apiKey,
      });
    } catch (error) {
      this.logger.error(
        `Evolution sendText error: conversationId=${params.conversation?.id ?? 'null'} instance=${params.instance.instanceName} phoneNumber=${params.phoneNumber} error=${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw error;
    }

    this.logger.log(
      `Evolution sendText response: conversationId=${params.conversation?.id ?? 'null'} instance=${params.instance.instanceName} success=${providerResult.success} messageId=${providerResult.messageId ?? 'null'}`,
    );
    this.logger.log(
      `WHATSAPP_REPLY_SENT conversationId=${params.conversation?.id ?? 'null'} instance=${params.instance.instanceName} providerMessageId=${providerResult.messageId ?? 'null'}`,
    );

    const storedMessage = await this.recordOutboundMessage({
      conversation: params.conversation,
      externalMessageId: providerResult.messageId,
      senderType: params.senderType,
      senderId: params.senderId,
      content: params.message,
      rawPayload: {
        provider: providerResult.provider,
        raw: providerResult.raw,
        instanceName: params.instance.instanceName,
      },
    });
    const kbSuggestion =
      storedMessage && this.isHumanAgentSender(params.senderType)
        ? await this.createKbSuggestionFromHumanReply({
            conversation: params.conversation,
            humanAnswerMessageId: storedMessage.id,
            humanAnswer: params.message,
            occurredAt: storedMessage.createdAt,
          })
        : null;

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
      instanceName: params.instance.instanceName,
      kbSuggestionId: kbSuggestion?.id ?? null,
    };
  }

  private async recordOutboundMessage(params: {
    conversation: WhatsappConversationContext | null;
    externalMessageId: string | null;
    senderType: StoredWhatsappSenderType;
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
        lastHumanMessageAt:
          params.senderType === 'human_agent'
            ? now
            : undefined,
        updatedAt: now,
      },
    });

    return message;
  }

  private async findRecentDuplicateBotReply(params: {
    conversationId: string | null;
    senderType: StoredWhatsappSenderType;
    content: string;
  }) {
    if (!params.conversationId || params.senderType !== 'bot') {
      return null;
    }

    const latestMessage = await this.prisma.message.findFirst({
      where: {
        conversationId: params.conversationId,
      },
      select: {
        id: true,
        direction: true,
        senderType: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      latestMessage?.direction !== 'outbound' ||
      latestMessage.senderType !== 'bot' ||
      latestMessage.content !== params.content
    ) {
      return null;
    }

    const recentWindowStart = new Date(Date.now() - 5 * 60 * 1000);

    return latestMessage.createdAt >= recentWindowStart
      ? { id: latestMessage.id }
      : null;
  }

  private isHumanAgentSender(senderType: StoredWhatsappSenderType) {
    return senderType === 'human_agent';
  }

  private async createKbSuggestionFromHumanReply(params: {
    conversation: WhatsappConversationContext | null;
    humanAnswerMessageId: string;
    humanAnswer: string;
    occurredAt: Date;
  }) {
    if (!params.conversation || !params.humanAnswer.trim()) {
      return null;
    }

    if (!(await this.shouldCreateKbSuggestion(params.conversation))) {
      return null;
    }

    const existingSuggestion = await this.prisma.kbSuggestion.findFirst({
      where: {
        humanAnswerMessageId: params.humanAnswerMessageId,
      },
      select: { id: true },
    });

    if (existingSuggestion) {
      return existingSuggestion;
    }

    const customerMessage = await this.prisma.message.findFirst({
      where: {
        conversationId: params.conversation.id,
        ...(params.conversation.companyId
          ? { companyId: params.conversation.companyId }
          : {}),
        direction: 'inbound',
        content: { not: null },
        createdAt: { lte: params.occurredAt },
      },
      orderBy: [{ messageTimestamp: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        content: true,
      },
    });

    const question = customerMessage?.content?.trim() ?? '';
    if (!customerMessage || !question) {
      return null;
    }

    const suggestion = await this.prisma.kbSuggestion.create({
      data: {
        companyId: params.conversation.companyId,
        conversationId: params.conversation.id,
        customerMessageId: customerMessage.id,
        humanAnswerMessageId: params.humanAnswerMessageId,
        question,
        answer: params.humanAnswer.trim(),
        status: 'pending',
        reviewedBy: null,
        createdBy: null,
        createdAt: new Date(),
        reviewedAt: null,
      },
      select: { id: true },
    });

    this.logger.log(
      `KB suggestion created from human reply: suggestionId=${suggestion.id} conversationId=${params.conversation.id} companyId=${params.conversation.companyId ?? 'null'}`,
    );

    return suggestion;
  }

  private async shouldCreateKbSuggestion(
    conversation: WhatsappConversationContext,
  ): Promise<boolean> {
    if (conversation.handoffRequired === true) {
      return true;
    }

    const latestAiRun = await this.prisma.aiRun.findFirst({
      where: {
        conversationId: conversation.id,
        OR: [
          { responseMode: 'HANDOFF_REQUIRED' },
          { handoffRequired: true },
          { reason: 'no_reliable_knowledge_base_answer' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    return Boolean(latestAiRun);
  }

  private async findConversationContext(
    conversationId: string,
    companyId?: string,
  ): Promise<WhatsappConversationContext> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        ...(companyId ? { companyId } : {}),
      },
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

  private assertCompanyAccess(
    actor: AuthenticatedUser,
    requestedCompanyId?: string,
  ) {
    if (actor.role === UserRole.SUPER_ADMIN) {
      const companyId = requestedCompanyId?.trim() || actor.companyId || null;
      if (!companyId) {
        throw new BadRequestException('companyId is required for SUPER_ADMIN');
      }
      return companyId;
    }

    if (!actor.companyId) {
      throw new ForbiddenException('User is not linked to a company');
    }

    if (requestedCompanyId) {
      throw new ForbiddenException(
        'companyId must be resolved from the authenticated user',
      );
    }

    return actor.companyId;
  }

  private assertTechnicalWhatsappSettingsAccess(
    actor: AuthenticatedUser,
    requestedCompanyId?: string,
  ): string {
    if (actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'WhatsApp technical settings are managed by the platform',
      );
    }

    return this.assertCompanyAccess(actor, requestedCompanyId);
  }

  private assertNoCompanyAdminTechnicalFields(
    actor: AuthenticatedUser,
    dto: UpdateCompanyWhatsappInstanceDto,
  ) {
    if (actor.role === UserRole.SUPER_ADMIN) {
      return;
    }

    const sentTechnicalField = TECHNICAL_WHATSAPP_FIELDS.find((field) => {
      const value = dto[field];
      return typeof value === 'string' && value.trim().length > 0;
    });

    if (sentTechnicalField) {
      throw new BadRequestException(
        `${sentTechnicalField} is managed by the platform and cannot be edited by company admins`,
      );
    }
  }

  private resolveEvolutionRuntimeConfig(instance?: {
    apiBaseUrl?: string | null;
    apiKey?: string | null;
  }) {
    return {
      apiBaseUrl:
        instance?.apiBaseUrl?.trim() || process.env.EVOLUTION_API_URL || null,
      apiKey: instance?.apiKey?.trim() || process.env.EVOLUTION_API_KEY || null,
    };
  }

  private assertEvolutionRuntimeConfigured(runtime: {
    apiBaseUrl: string | null;
    apiKey: string | null;
  }) {
    if (!runtime.apiBaseUrl || !runtime.apiKey) {
      throw new BadRequestException({
        code: 'EVOLUTION_PLATFORM_CONFIG_MISSING',
        message: 'La configuration Evolution API est geree par la plateforme.',
      });
    }
  }

  async getCompanyInstance(actor: AuthenticatedUser, requestedCompanyId?: string) {
    const companyId = this.assertTechnicalWhatsappSettingsAccess(
      actor,
      requestedCompanyId,
    );
    const instance = await this.prisma.companyWhatsappInstance.findFirst({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    });

    return this.toCompanyInstanceView(companyId, instance);
  }

  async updateCompanyInstance(
    actor: AuthenticatedUser,
    dto: UpdateCompanyWhatsappInstanceDto,
    requestedCompanyId?: string,
  ) {
    const companyId = this.assertTechnicalWhatsappSettingsAccess(
      actor,
      requestedCompanyId,
    );
    this.assertNoCompanyAdminTechnicalFields(actor, dto);
    const current = await this.prisma.companyWhatsappInstance.findFirst({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    });
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    const instanceName =
      this.normalizeNullableString(dto.evolutionInstanceName) ??
      current?.evolutionInstanceName ??
      this.defaultInstanceName(company?.name, companyId);
    const whatsappNumber =
      this.normalizeNullableString(dto.whatsappNumber) ??
      this.normalizeNullableString(dto.businessPhoneNumber) ??
      current?.whatsappNumber ??
      null;
    const apiKey =
      actor.role === UserRole.SUPER_ADMIN
        ? this.normalizeNullableString(dto.apiKey)
        : null;

    const data = {
      evolutionInstanceName: instanceName,
      whatsappNumber,
      displayName:
        this.normalizeNullableString(dto.displayName) ??
        current?.displayName ??
        company?.name ??
        null,
      phoneNumberId:
        (actor.role === UserRole.SUPER_ADMIN
          ? this.normalizeNullableString(dto.phoneNumberId)
          : null) ??
        current?.phoneNumberId ??
        null,
      businessAccountId:
        (actor.role === UserRole.SUPER_ADMIN
          ? this.normalizeNullableString(dto.businessAccountId)
          : null) ??
        current?.businessAccountId ??
        null,
      apiBaseUrl:
        (actor.role === UserRole.SUPER_ADMIN
          ? this.normalizeNullableString(dto.apiBaseUrl)
          : null) ??
        current?.apiBaseUrl ??
        null,
      ...(apiKey ? { apiKey } : {}),
      connectionStatus: current?.connectionStatus ?? 'DISCONNECTED',
      lastConnectionError: current?.lastConnectionError ?? null,
      lastSyncAt: new Date(),
    };

    const saved = current
      ? await this.prisma.companyWhatsappInstance.update({
          where: { id: current.id },
          data,
        })
      : await this.prisma.companyWhatsappInstance.create({
          data: {
            ...data,
            companyId,
          },
        });

    return this.toCompanyInstanceView(companyId, saved);
  }

  async getCompanyWhatsappConfig(actor: AuthenticatedUser) {
    const companyId = this.assertTechnicalWhatsappSettingsAccess(actor);
    const instance = await this.findLatestCompanyInstance(companyId);

    return this.toCompanyWhatsappConfigView(instance);
  }

  async connectCompanyWhatsapp(
    actor: AuthenticatedUser,
    dto: CompanyWhatsappConnectDto = {},
  ) {
    const companyId = this.assertTechnicalWhatsappSettingsAccess(actor);
    const instance = await this.ensureCompanyWhatsappInstance(companyId, dto);
    const runtime = this.resolveEvolutionRuntimeConfig(instance);
    this.assertEvolutionRuntimeConfigured(runtime);

    try {
      await this.evolutionApiClient.createOrEnsureInstance(
        instance.evolutionInstanceName,
        {
          baseUrl: runtime.apiBaseUrl,
          apiKey: runtime.apiKey,
        },
      );
      const raw = await this.evolutionApiClient.connectInstance(
        instance.evolutionInstanceName,
        {
          baseUrl: runtime.apiBaseUrl,
          apiKey: runtime.apiKey,
        },
      );
      const qrCode = this.extractQrCode(raw);
      const saved = await this.prisma.companyWhatsappInstance.update({
        where: { id: instance.id },
        data: {
          connectionStatus: qrCode ? 'QR_READY' : 'CONNECTING',
          lastConnectionError: null,
          lastSyncAt: new Date(),
        },
      });

      return {
        ...this.toCompanyWhatsappConfigView(saved),
        qrAvailable: Boolean(qrCode),
      };
    } catch (error) {
      this.logger.warn(
        `Company WhatsApp connect failed companyId=${companyId} instance=${instance.evolutionInstanceName} error=${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.prisma.companyWhatsappInstance.update({
        where: { id: instance.id },
        data: {
          connectionStatus: 'ERROR',
          lastConnectionError: 'Impossible de preparer la connexion WhatsApp.',
          lastSyncAt: new Date(),
        },
      });
      throw new BadRequestException(
        'Impossible de preparer la connexion WhatsApp. Reessayez plus tard.',
      );
    }
  }

  async getCompanyWhatsappQr(actor: AuthenticatedUser) {
    const companyId = this.assertTechnicalWhatsappSettingsAccess(actor);
    const instance = await this.ensureCompanyWhatsappInstance(companyId);
    const runtime = this.resolveEvolutionRuntimeConfig(instance);
    this.assertEvolutionRuntimeConfigured(runtime);

    try {
      const raw = await this.evolutionApiClient.getQrCode(
        instance.evolutionInstanceName,
        {
          baseUrl: runtime.apiBaseUrl,
          apiKey: runtime.apiKey,
        },
      );
      const qrCode = this.extractQrCode(raw);
      const saved = await this.prisma.companyWhatsappInstance.update({
        where: { id: instance.id },
        data: {
          connectionStatus: qrCode ? 'QR_READY' : 'CONNECTING',
          lastConnectionError: null,
          lastSyncAt: new Date(),
        },
      });

      return {
        status: this.toFrontendConnectionStatus(saved.connectionStatus),
        qrCode,
        pairingCode: this.extractPairingCode(raw),
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(
        `Company WhatsApp QR fetch failed companyId=${companyId} instance=${instance.evolutionInstanceName} error=${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new BadRequestException(
        'Impossible de recuperer le QR code WhatsApp pour le moment.',
      );
    }
  }

  async disconnectCompanyWhatsapp(actor: AuthenticatedUser) {
    const companyId = this.assertTechnicalWhatsappSettingsAccess(actor);
    const instance = await this.findLatestCompanyInstance(companyId);

    if (!instance) {
      return this.toCompanyWhatsappConfigView(null);
    }

    const runtime = this.resolveEvolutionRuntimeConfig(instance);
    if (runtime.apiBaseUrl && runtime.apiKey) {
      try {
        await this.evolutionApiClient.disconnectInstance(
          instance.evolutionInstanceName,
          {
            baseUrl: runtime.apiBaseUrl,
            apiKey: runtime.apiKey,
          },
        );
      } catch (error) {
        this.logger.warn(
          `Company WhatsApp disconnect failed companyId=${companyId} instance=${instance.evolutionInstanceName} error=${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    const saved = await this.prisma.companyWhatsappInstance.update({
      where: { id: instance.id },
      data: {
        connectionStatus: 'DISCONNECTED',
        lastConnectionError: null,
        connectedAt: null,
        lastSyncAt: new Date(),
      },
    });

    return this.toCompanyWhatsappConfigView(saved);
  }

  async resetCompanyWhatsapp(actor: AuthenticatedUser) {
    const companyId = this.assertTechnicalWhatsappSettingsAccess(actor);
    const instance = await this.findLatestCompanyInstance(companyId);

    if (!instance) {
      return this.toCompanyWhatsappConfigView(null);
    }

    const runtime = this.resolveEvolutionRuntimeConfig(instance);
    if (runtime.apiBaseUrl && runtime.apiKey) {
      try {
        await this.evolutionApiClient.disconnectInstance(
          instance.evolutionInstanceName,
          {
            baseUrl: runtime.apiBaseUrl,
            apiKey: runtime.apiKey,
          },
        );
      } catch (error) {
        this.logger.warn(
          `Company WhatsApp reset disconnect skipped companyId=${companyId} instance=${instance.evolutionInstanceName} error=${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    const saved = await this.prisma.companyWhatsappInstance.update({
      where: { id: instance.id },
      data: {
        whatsappNumber: null,
        connectionStatus: 'DISCONNECTED',
        lastConnectionError: null,
        connectedAt: null,
        lastSyncAt: new Date(),
      },
    });

    return this.toCompanyWhatsappConfigView(saved);
  }

  async testCompanyInstance(
    actor: AuthenticatedUser,
    requestedCompanyId?: string,
  ) {
    const companyId = this.assertTechnicalWhatsappSettingsAccess(
      actor,
      requestedCompanyId,
    );
    const instance = await this.prisma.companyWhatsappInstance.findFirst({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!instance?.evolutionInstanceName) {
      return this.persistConnectionTestResult(companyId, instance?.id ?? null, {
        ok: false,
        code: 'CONFIGURATION_INCOMPLETE',
        status: 'DISCONNECTED',
        message: 'Configuration incomplete: nom instance Evolution manquant.',
        raw: null,
      });
    }

    const runtime = this.resolveEvolutionRuntimeConfig(instance);

    if (!runtime.apiBaseUrl || !runtime.apiKey) {
      return this.persistConnectionTestResult(companyId, instance.id, {
        ok: false,
        code: 'CONFIGURATION_INCOMPLETE',
        status: 'DISCONNECTED',
        message: 'Configuration Evolution API geree par la plateforme incomplete.',
        raw: null,
      });
    }

    try {
      const raw = await this.evolutionApiClient.getConnectionState(
        instance.evolutionInstanceName,
        {
          baseUrl: runtime.apiBaseUrl,
          apiKey: runtime.apiKey,
        },
      );
      const connectionStatus = this.normalizeEvolutionConnectionStatus(raw);
      const connectedNumber = await this.evolutionApiClient.fetchConnectedNumber(
        instance.evolutionInstanceName,
        {
          baseUrl: runtime.apiBaseUrl,
          apiKey: runtime.apiKey,
        },
      );

      return this.persistConnectionTestResult(companyId, instance.id, {
        ok: connectionStatus === 'CONNECTED',
        code:
          connectionStatus === 'CONNECTED'
            ? 'CONNECTION_SUCCESS'
            : 'INSTANCE_NOT_CONNECTED',
        status: connectionStatus,
        message:
          connectionStatus === 'CONNECTED'
            ? 'Connexion Evolution API reussie.'
            : 'Instance trouvee mais non connectee.',
        whatsappNumber: connectedNumber.number ?? instance.whatsappNumber ?? null,
        raw: {
          state: raw,
          connectedNumber: connectedNumber.raw,
        },
      });
    } catch (error) {
      const mapped = this.mapEvolutionConnectionError(error);
      return this.persistConnectionTestResult(companyId, instance.id, mapped);
    }
  }

  private async findLatestCompanyInstance(companyId: string) {
    return this.prisma.companyWhatsappInstance.findFirst({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async ensureCompanyWhatsappInstance(
    companyId: string,
    dto: CompanyWhatsappConnectDto = {},
  ) {
    const current = await this.findLatestCompanyInstance(companyId);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const requestedInstanceName = this.normalizeNullableString(
      dto.evolutionInstanceName,
    );
    const instanceName =
      requestedInstanceName ??
      current?.evolutionInstanceName ??
      this.defaultInstanceName(company?.name, companyId);

    const instanceOwner = await this.prisma.companyWhatsappInstance.findUnique({
      where: { evolutionInstanceName: instanceName },
      select: { id: true, companyId: true },
    });

    if (instanceOwner && instanceOwner.companyId !== companyId) {
      throw new BadRequestException(
        'This Evolution instance name is already linked to another company',
      );
    }

    if (current) {
      return this.prisma.companyWhatsappInstance.update({
        where: { id: current.id },
        data: {
          evolutionInstanceName: instanceName,
          displayName: current.displayName ?? company?.name ?? null,
          lastSyncAt: new Date(),
        },
      });
    }

    return this.prisma.companyWhatsappInstance.create({
      data: {
        companyId,
        evolutionInstanceName: instanceName,
        whatsappNumber: null,
        displayName: company?.name ?? null,
        connectionStatus: 'DISCONNECTED',
        lastSyncAt: new Date(),
      },
    });
  }

  private extractQrCode(payload: Record<string, unknown>): string | null {
    const scan = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (
          trimmed.startsWith('data:image') ||
          trimmed.length > 100 ||
          /^[A-Za-z0-9+/=]{80,}$/.test(trimmed)
        ) {
          return trimmed;
        }
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          const found = scan(item);
          if (found) return found;
        }
      }

      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const directCandidates = [
          record.qrcode,
          record.qrCode,
          record.qr,
          record.base64,
          record.code,
        ];

        for (const candidate of directCandidates) {
          const found = scan(candidate);
          if (found) return found;
        }

        for (const nested of Object.values(record)) {
          const found = scan(nested);
          if (found) return found;
        }
      }

      return null;
    };

    return scan(payload);
  }

  private extractPairingCode(payload: Record<string, unknown>): string | null {
    const scan = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^[A-Z0-9-]{6,20}$/i.test(trimmed)) return trimmed;
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        const direct = record.pairingCode ?? record.pairing_code;
        if (typeof direct === 'string' && direct.trim()) {
          return direct.trim();
        }

        for (const nested of Object.values(record)) {
          const found = scan(nested);
          if (found) return found;
        }
      }

      return null;
    };

    return scan(payload);
  }

  private normalizeSenderType(
    senderType: WhatsappSenderType,
  ): StoredWhatsappSenderType {
    if (
      senderType === 'agent' ||
      senderType === 'human' ||
      senderType === 'human_agent'
    ) {
      return 'human_agent';
    }

    return senderType;
  }

  private async resolveInstanceConfig(params: {
    companyId: string | null;
    providedInstance?: string;
  }): Promise<ResolvedEvolutionInstance> {
    const providedInstance = params.providedInstance?.trim();

    if (providedInstance) {
      const instance = await this.findCompanyWhatsappInstanceByName(
        providedInstance,
        params.companyId,
      );

      if (instance) {
        return this.toResolvedEvolutionInstance(instance, providedInstance);
      }
    }

    if (!params.companyId) {
      return {
        instanceName: null,
        apiBaseUrl: null,
        apiKey: null,
      };
    }

    const linked = await this.prisma.companyWhatsappInstance.findFirst({
      where: {
        companyId: params.companyId,
      },
      orderBy: [{ connectionStatus: 'desc' }, { updatedAt: 'desc' }],
    });

    return this.toResolvedEvolutionInstance(linked);
  }

  private async findCompanyWhatsappInstanceByName(
    instanceName: string,
    companyId: string | null,
  ): Promise<CompanyWhatsappInstanceConfig | null> {
    const candidates = buildEvolutionInstanceLookupCandidates(instanceName);
    const companyScope = companyId ? { companyId } : {};
    const exact = candidates.length
      ? await this.prisma.companyWhatsappInstance.findFirst({
          where: {
            ...companyScope,
            OR: candidates.map((candidate) => ({
              evolutionInstanceName: candidate,
            })),
          },
          select: {
            companyId: true,
            evolutionInstanceName: true,
            apiBaseUrl: true,
            apiKey: true,
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (exact) {
      return exact;
    }

    const instances = await this.prisma.companyWhatsappInstance.findMany({
      where: companyScope,
      select: {
        companyId: true,
        evolutionInstanceName: true,
        apiBaseUrl: true,
        apiKey: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return findMatchingEvolutionInstance(instances, instanceName);
  }

  private toResolvedEvolutionInstance(
    instance?: CompanyWhatsappInstanceConfig | null,
    runtimeInstanceName?: string | null,
  ): ResolvedEvolutionInstance {
    const providedRuntimeInstance = runtimeInstanceName?.trim();

    return {
      instanceName:
        (providedRuntimeInstance || instance?.evolutionInstanceName) ?? null,
      apiBaseUrl: instance?.apiBaseUrl ?? null,
      apiKey: instance?.apiKey ?? null,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private normalizeNullableString(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private defaultInstanceName(companyName: string | undefined, companyId: string) {
    const prefix = (companyName ?? 'company')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32);

    return `${prefix || 'company'}-${companyId.slice(0, 8)}`;
  }

  private toCompanyInstanceView(
    companyId: string,
    instance: {
      id: string;
      evolutionInstanceName: string;
      whatsappNumber: string | null;
      displayName?: string | null;
      phoneNumberId?: string | null;
      businessAccountId?: string | null;
      apiBaseUrl?: string | null;
      apiKey?: string | null;
      connectionStatus: string;
      lastConnectionError?: string | null;
      connectedAt: Date | null;
      lastSyncAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } | null,
  ) {
    return {
      companyId,
      id: instance?.id ?? null,
      evolutionInstanceName: instance?.evolutionInstanceName ?? '',
      businessPhoneNumber: instance?.whatsappNumber ?? '',
      whatsappNumber: instance?.whatsappNumber ?? '',
      displayName: instance?.displayName ?? '',
      connectionStatus: this.toFrontendConnectionStatus(
        instance?.connectionStatus ?? 'DISCONNECTED',
      ),
      lastConnectionError: instance?.lastConnectionError ?? null,
      connectedAt: instance?.connectedAt?.toISOString() ?? null,
      lastSyncAt: instance?.lastSyncAt?.toISOString() ?? null,
      updatedAt: instance?.updatedAt?.toISOString() ?? null,
    };
  }

  private toCompanyWhatsappConfigView(
    instance: {
      id: string;
      evolutionInstanceName: string;
      whatsappNumber: string | null;
      displayName?: string | null;
      connectionStatus: string;
      lastConnectionError?: string | null;
      connectedAt: Date | null;
      lastSyncAt: Date | null;
      updatedAt: Date;
    } | null,
  ) {
    return {
      id: instance?.id ?? null,
      evolutionInstanceName: instance?.evolutionInstanceName ?? '',
      connectionStatus: this.toFrontendConnectionStatus(
        instance?.connectionStatus ?? 'DISCONNECTED',
      ),
      whatsappNumber: instance?.whatsappNumber ?? '',
      displayName: instance?.displayName ?? '',
      lastConnectionError: instance?.lastConnectionError ?? null,
      connectedAt: instance?.connectedAt?.toISOString() ?? null,
      lastSyncAt: instance?.lastSyncAt?.toISOString() ?? null,
      updatedAt: instance?.updatedAt?.toISOString() ?? null,
      technicalConfigurationManagedByPlatform: true,
      sensitiveFieldsExposed: false,
    };
  }

  private toFrontendConnectionStatus(
    status: string,
  ): FrontendWhatsappConnectionStatus {
    if (status === 'CONNECTED') return 'connected';
    if (status === 'CONNECTING' || status === 'QR_READY') return 'pending';
    return 'disconnected';
  }

  private normalizeEvolutionConnectionStatus(raw: Record<string, unknown>) {
    const serialized = JSON.stringify(raw).toLowerCase();

    if (
      serialized.includes('open') ||
      serialized.includes('connected') ||
      serialized.includes('online')
    ) {
      return 'CONNECTED' as const;
    }

    if (serialized.includes('qrcode') || serialized.includes('qr')) {
      return 'QR_READY' as const;
    }

    if (serialized.includes('connecting')) {
      return 'CONNECTING' as const;
    }

    return 'DISCONNECTED' as const;
  }

  private mapEvolutionConnectionError(error: unknown) {
    if (error instanceof EvolutionApiRequestError) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        return {
          ok: false,
          code: 'INVALID_API_KEY',
          status: 'ERROR' as const,
          message: 'La connexion WhatsApp est refusee par le fournisseur.',
          raw: error.responseBody,
        };
      }

      if (error.statusCode === 404) {
        return {
          ok: false,
          code: 'INSTANCE_NOT_FOUND',
          status: 'DISCONNECTED' as const,
          message: 'Instance Evolution introuvable pour cette entreprise.',
          raw: error.responseBody,
        };
      }
    }

    return {
      ok: false,
      code: 'EVOLUTION_UNREACHABLE',
      status: 'ERROR' as const,
      message: 'Evolution API inaccessible.',
      raw: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }

  private async persistConnectionTestResult(
    companyId: string,
    instanceId: string | null,
    result: {
      ok: boolean;
      code: string;
      status: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED' | 'ERROR';
      message: string;
      whatsappNumber?: string | null;
      raw: Record<string, unknown> | null;
    },
  ) {
    const now = new Date();

    if (instanceId) {
      await this.prisma.companyWhatsappInstance.update({
        where: { id: instanceId },
        data: {
          connectionStatus: result.status,
          whatsappNumber: result.whatsappNumber ?? undefined,
          lastConnectionError: result.ok ? null : result.message,
          connectedAt: result.status === 'CONNECTED' ? now : undefined,
          lastSyncAt: now,
        },
      });
    }

    return {
      companyId,
      ok: result.ok,
      code: result.code,
      status: this.toFrontendConnectionStatus(result.status),
      message: result.message,
      checkedAt: now.toISOString(),
    };
  }
}
