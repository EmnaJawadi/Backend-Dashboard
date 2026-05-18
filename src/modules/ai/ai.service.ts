import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  NotificationPriority,
  NotificationType,
} from '../../generated/prisma/client';
import { GeminiService } from '../../integrations/gemini/gemini.service';
import { AiRunsRepository } from '../ai-runs/ai-runs.repository';
import { RagService } from '../rag/rag.service';
import { AiReplyRequestDto } from './dto/ai-reply-request.dto';
import { AiReplyResponseDto } from './dto/ai-reply-response.dto';
import { StructuredOutputDto } from './dto/structured-output.dto';
import { AiSafetyRulesService } from './policies/ai-safety-rules.service';
import {
  CustomerIntent,
  CustomerIntentService,
} from './policies/customer-intent.service';
import { EscalationDecisionService } from './policies/escalation-decision.service';
import { HallucinationGuardService } from './policies/hallucination-guard.service';
import { ConversationWindowService } from '../whatsapp/policies/conversation-window.service';
import { CustomerReplyFormatterService } from './formatters/customer-reply-formatter.service';
import { ProductVisionService } from '../products/product-vision.service';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
import { buildStructuredReplyPrompt } from './prompts/reply.prompt';
import { buildSummarizerPrompt } from './prompts/summarizer.prompt';

type AiIntent =
  | CustomerIntent
  | 'SERVICES_QUERY'
  | 'PRICE_QUERY'
  | 'DELIVERY_QUERY'
  | 'DELIVERY_OR_PRODUCT_AMBIGUOUS_QUERY'
  | 'PAYMENT_QUERY'
  | 'PRODUCT_AVAILABILITY_QUERY'
  | 'ORDER_REQUEST'
  | 'ORDER_DETAILS_RECEIVED'
  | 'THANK_YOU'
  | 'UNKNOWN_QUERY'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'PRICE_INQUIRY'
  | 'SERVICES_INQUIRY'
  | 'MENU_INQUIRY'
  | 'AVAILABILITY_INQUIRY'
  | 'ORDER_INQUIRY'
  | 'DELIVERY_INQUIRY'
  | 'COMPLAINT'
  | 'DANGEROUS_OR_URGENT_COMPLAINT'
  | 'IMAGE_UNDERSTANDING'
  | 'AUDIO_TRANSCRIPTION'
  | 'THANKS'
  | 'GOODBYE'
  | 'pricing'
  | 'refund'
  | 'technical_support'
  | 'order_status'
  | 'complaint'
  | 'greeting'
  | 'other'
  | 'unknown';

type AgentJsonOutput = {
  intent?: string;
  answer?: string;
  requestedProductService?: string | null;
  requestedDeliveryDate?: string | null;
  nextAction?: string | null;
  confidence?: number;
  handoffRequired?: boolean;
  needsClarification?: boolean;
  sources?: string[];
  tagsToApply?: string[];
  reason?: string | null;
};

type ConversationContext = {
  id: string;
  companyId: string | null;
  status: string | null;
  assignedTo: string | null;
  botPaused: boolean | null;
  handoffRequired: boolean | null;
  lastCustomerMessageAt: Date | null;
  conversationSummary: string | null;
  customerIntent: string | null;
  requestedProductService: string | null;
  requestedDeliveryDate: string | null;
  nextAction: string | null;
  importantNotes: string | null;
  contact: {
    id: string;
    fullName: string | null;
    whatsappName: string | null;
    language: string | null;
  };
  messages: Array<{
    id: string;
    direction: string | null;
    senderType: string | null;
    content: string | null;
    messageType: string | null;
  }>;
};

type UsageSnapshot = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

type CompanyContext = {
  name: string | null;
};

type WorkflowValidationResult = {
  valid: boolean;
  missingFields: string[];
  reason: string;
};

type ImageUnderstandingResult = {
  imageUnderstanding: string;
  detectedIntent: AiIntent;
  normalizedQuestion: string;
  confidence: number;
  usedVision: boolean;
  failed: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly ragService: RagService,
    private readonly aiRunsRepository: AiRunsRepository,
    private readonly aiSafetyRulesService: AiSafetyRulesService,
    private readonly customerIntentService: CustomerIntentService,
    private readonly escalationDecisionService: EscalationDecisionService,
    private readonly hallucinationGuardService: HallucinationGuardService,
    private readonly conversationWindowService: ConversationWindowService,
    private readonly customerReplyFormatter: CustomerReplyFormatterService,
    private readonly productVisionService: ProductVisionService,
  ) {}

  async generateReply(
    payload: AiReplyRequestDto,
    actor?: AuthenticatedUser,
    options?: { enforceWorkflowPayload?: boolean },
  ): Promise<AiReplyResponseDto> {
    const startedAt = Date.now();
    this.logger.log(
      `AI_RAG_REQUEST_RECEIVED conversationId=${payload.conversationId ?? 'null'} companyId=${payload.companyId ?? 'null'} messageId=${payload.messageId ?? 'null'} messageType=${payload.messageType ?? 'unknown'}`,
    );

    try {
      return await this.generateReplyInternal(payload, actor, startedAt, options);
    } catch (error) {
      this.logger.error(
        `AI_RAG_ERROR conversationId=${payload.conversationId ?? 'null'} companyId=${payload.companyId ?? 'null'} messageId=${payload.messageId ?? 'null'} error=${this.getSafeErrorMessage(error)}`,
      );

      return this.buildWorkflowErrorResponse({
        payload,
        startedAt,
        reason: 'ai_rag_error',
        error,
      });
    }
  }

  private async generateReplyInternal(
    payload: AiReplyRequestDto,
    actor: AuthenticatedUser | undefined,
    startedAt: number,
    options?: { enforceWorkflowPayload?: boolean },
  ): Promise<AiReplyResponseDto> {
    let message = (payload.message ?? payload.messageText ?? '').trim();
    payload.message = message;
    const messageType = this.normalizeWorkflowMessageType(payload.messageType);
    payload.messageType = messageType;

    const validation = this.validateWorkflowPayload(payload);
    if (options?.enforceWorkflowPayload && !validation.valid) {
      this.logger.warn(
        `AI_RAG_VALIDATION_FAILED reason=${validation.reason} missingFields=${validation.missingFields.join(',') || 'none'} conversationId=${payload.conversationId ?? 'null'} companyId=${payload.companyId ?? 'null'} messageId=${payload.messageId ?? 'null'}`,
      );

      return this.buildWorkflowValidationResponse(payload, validation, startedAt);
    }

    const companyScope = resolveCompanyScope(actor);
    const conversation = payload.conversationId
      ? await this.getConversationContext(payload.conversationId, companyScope)
      : null;

    if (payload.conversationId && !conversation) {
      this.logger.warn(
        `AI_RAG_VALIDATION_FAILED reason=conversation_not_found conversationId=${payload.conversationId} companyId=${payload.companyId ?? 'null'}`,
      );

      return this.buildWorkflowValidationResponse(
        payload,
        {
          valid: false,
          missingFields: ['conversationId'],
          reason: 'conversation_not_found',
        },
        startedAt,
      );
    }

    const resolvedCompanyId =
      companyScope ||
      conversation?.companyId?.trim() ||
      payload.companyId?.trim() ||
      null;

    if (!resolvedCompanyId) {
      this.logger.warn(
        `AI_RAG_VALIDATION_FAILED reason=missing_company_id conversationId=${payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'}`,
      );

      return this.buildWorkflowValidationResponse(
        payload,
        {
          valid: false,
          missingFields: ['companyId'],
          reason: 'missing_company_id',
        },
        startedAt,
      );
    }

    payload.companyId = resolvedCompanyId;
    const companyContext = await this.getCompanyContext(resolvedCompanyId);
    const companyName = companyContext?.name ?? null;
    this.logger.log(
      `AI_RAG_COMPANY_SCOPE companyId=${resolvedCompanyId} conversationId=${payload.conversationId ?? conversation?.id ?? 'null'} instanceName=${payload.instanceName ?? payload.instance ?? 'null'}`,
    );
    this.logger.log(
      `CONVERSATION_CONTEXT_LOADED conversationId=${conversation?.id ?? 'null'} usedConversationContext=${Boolean(conversation)} recentMessages=${conversation?.messages.length ?? 0}`,
    );
    this.logAiReplyState({
      conversationId: payload.conversationId ?? conversation?.id ?? null,
      companyId: resolvedCompanyId,
      botPaused: conversation?.botPaused ?? null,
      ragSourceCount: 0,
    });

    const history = this.buildHistory(payload, conversation);
    let usedVision = false;

    if (payload.fromMe === true) {
      this.logger.log(
        `MESSAGE_FROM_ME_IGNORED conversationId=${conversation?.id ?? payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'}`,
      );

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response: this.buildBaseResponse({
          intent: 'UNKNOWN',
          answer: '',
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: 0,
          reason: 'message_from_me',
          action: 'ignored',
          sources: [],
          tagsToApply: [],
          provider: 'backend',
          model: 'message_from_me',
          metadata: { ignored: true },
        }),
      });
    }

    if (messageType === 'audio') {
      this.logger.log(
        `AUDIO_MESSAGE_RECEIVED conversationId=${conversation?.id ?? payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'}`,
      );
      this.logger.warn(
        `AUDIO_UNSUPPORTED conversationId=${conversation?.id ?? payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'}`,
      );

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response: this.buildBaseResponse({
          intent: 'AUDIO_TRANSCRIPTION',
          answer: '',
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: 0,
          reason: 'unsupported_audio_message',
          action: 'ignored',
          sources: [],
          tagsToApply: ['audio_unsupported'],
          provider: 'backend',
          model: 'unsupported_audio',
          metadata: {
            ignored: true,
            usedAudioTranscription: false,
          },
        }),
      });
    }

    if ((messageType === 'video' || messageType === 'document') && !message) {
      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response: this.buildBaseResponse({
          intent: 'UNKNOWN',
          answer: '',
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: 0,
          reason: 'unsupported_media_message',
          action: 'ignored',
          sources: [],
          tagsToApply: ['media_unsupported'],
          provider: 'backend',
          model: 'unsupported_media',
          metadata: { ignored: true },
        }),
      });
    }

    if (messageType === 'image') {
      this.logger.log(
        `IMAGE_MESSAGE_RECEIVED conversationId=${conversation?.id ?? payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'} captionLength=${message.length}`,
      );
      const productMatch = await this.productVisionService.analyzeAndMatch({
        companyId: resolvedCompanyId,
        caption: payload.caption ?? message,
        mediaUrl: payload.mediaUrl,
        mediaId: payload.mediaId,
        rawPayload: payload.rawPayload,
      });
      usedVision = Boolean(productMatch.analysis.rawText);
      (payload as AiReplyRequestDto & { __usedVision?: boolean }).__usedVision =
        usedVision;
      const productReply = this.productVisionService.buildReplyFromMatch(productMatch);
      const matchedProductId = productMatch.match?.product.id ?? null;
      const response = this.buildBaseResponse({
        intent: 'IMAGE_UNDERSTANDING',
        answer: productReply.answer,
        safe: true,
        handoffRequired: productReply.handoffRequired,
        needsClarification: false,
        confidence: productMatch.confidence,
        reason: productReply.reason,
        action: productReply.handoffRequired ? 'handoff' : 'reply_ready',
        sources: matchedProductId ? [`product:${matchedProductId}`] : [],
        tagsToApply: productReply.tagsToApply,
        allowHandoffReply: productReply.handoffRequired,
        provider: 'gemini',
        model: 'product_vision_matcher',
        metadata: {
          inputType: 'image',
          usedVision,
          imageAnalysisResult: productMatch.analysis,
          productImageAnalysis: productMatch.analysis,
          matchedProductId,
          productMatch: {
            query: productMatch.query,
            reliable: productMatch.reliable,
            confidence: productMatch.confidence,
            reason: productMatch.reason,
            candidates: productMatch.candidates,
          },
          ragSourcesFound: Boolean(matchedProductId),
        },
      });

      await this.updateConversationBusinessContext(conversation, {
        customerIntent: 'IMAGE_UNDERSTANDING',
        requestedProductService:
          productMatch.match?.product.name ??
          productMatch.analysis.detectedObject ??
          undefined,
        nextAction: response.handoffRequired
          ? 'human_review_product_image'
          : 'ai_answer_sent',
        lastAiDecision: this.stringifyAiDecision(response),
      });

      if (response.handoffRequired) {
        await this.prepareHandoff(conversation, response.reason);
      }

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    const detectedIntent = this.detectIntent(message) as CustomerIntent;
    this.logger.log(
      `INTENT_CLASSIFIED conversationId=${conversation?.id ?? payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'} intent=${detectedIntent} messageType=${messageType}`,
    );
    const allowedCategories = this.resolveAllowedCategories(detectedIntent);

    if (
      (payload.direction && payload.direction !== 'inbound') ||
      payload.messageType === 'system' ||
      payload.messageType === 'notification'
    ) {
      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response: this.buildBaseResponse({
          intent: 'unknown',
          answer: '',
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: 0,
          reason: 'non_inbound_message',
          action: 'ignored',
          sources: [],
          tagsToApply: [],
          provider: 'backend',
          model: 'non_inbound_message',
          metadata: { ignored: true },
        }),
      });
    }

    if (!message) {
      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response: this.buildBaseResponse({
          intent: 'unknown',
          answer: '',
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: 0,
          reason: 'empty_inbound_message',
          action: 'ignored',
          sources: [],
          tagsToApply: [],
          provider: 'backend',
          model: 'empty_inbound_message',
          metadata: { ignored: true },
        }),
      });
    }

    const mayBeOrderDetails = this.hasOrderDetailSignal(message);

    await this.updateConversationBusinessContext(conversation, {
      customerIntent: mayBeOrderDetails
        ? (conversation?.customerIntent ?? null)
        : detectedIntent,
      requestedProductService: this.extractRequestedProductService(message),
      requestedDeliveryDate: this.extractRequestedDeliveryDate(message),
      nextAction: mayBeOrderDetails
        ? (conversation?.nextAction ?? null)
        : 'ai_agent_triage',
      lastAiDecision: 'inbound_received',
    });

    if (conversation?.botPaused === true) {
      const response = this.buildBaseResponse({
        intent: this.detectIntent(message),
        answer: this.customerReplyFormatter.buildHandoffMessage(),
        safe: true,
        handoffRequired: true,
        needsClarification: false,
        confidence: 0.1,
        reason: 'bot_paused',
        action: 'handoff',
        sources: [],
        tagsToApply: ['handoff', 'bot_paused'],
        provider: 'backend',
        model: 'bot_paused',
        metadata: { botPaused: true },
      });

      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    if (this.hasHumanTakeover(conversation)) {
      const response = this.buildBaseResponse({
        intent: this.detectIntent(message),
        answer: '',
        safe: true,
        handoffRequired: true,
        needsClarification: false,
        confidence: 0.1,
        reason: 'human_takeover_active',
        action: 'handoff',
        sources: [],
        tagsToApply: ['handoff', 'human_takeover'],
        provider: 'backend',
        model: 'human_takeover',
        metadata: { humanTakeoverActive: true },
      });

      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    const safety = this.aiSafetyRulesService.evaluate(message);
    const sensitiveRiskDetected =
      detectedIntent === 'FOOD_COMPLAINT'
        ? false
        : this.detectSensitiveRisk(message);
    const customerRequestedHuman = this.didCustomerRequestHuman(message);

    if (
      detectedIntent === 'FOOD_COMPLAINT' ||
      this.isUrgentComplaint(message)
    ) {
      const urgent = this.isUrgentComplaint(message);
      const response = this.buildBaseResponse({
        intent: urgent ? 'DANGEROUS_OR_URGENT_COMPLAINT' : 'COMPLAINT',
        answer: urgent
          ? 'Nous sommes desoles pour ce probleme. Votre reclamation a ete prise en compte et notre equipe va la traiter rapidement.'
          : [
              'Bonjour, je suis desole pour ce probleme.',
              "Merci de nous envoyer une photo du plat, l'heure de reception et le detail de votre commande.",
              'Nous verifions votre reclamation en priorite.',
            ].join(' '),
        safe: true,
        handoffRequired: true,
        needsClarification: false,
        confidence: urgent ? 0.9 : 0.75,
        reason: urgent ? 'urgent_complaint' : 'complaint_requires_human',
        action: urgent ? 'reply_and_handoff' : 'handoff',
        sources: [],
        tagsToApply: urgent
          ? ['urgent_complaint', 'handoff']
          : ['complaint', 'handoff'],
        allowHandoffReply: true,
        provider: 'backend',
        model: urgent ? 'urgent_complaint_handoff' : 'complaint_handoff',
        metadata: {
          complaint: true,
          urgent,
        },
      });

      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    if (!safety.safe || sensitiveRiskDetected || customerRequestedHuman) {
      const reason = customerRequestedHuman
        ? 'customer_requested_human'
        : 'unsafe_or_sensitive_message';
      const response = this.buildBaseResponse({
        intent: this.detectIntent(message),
        answer: this.customerReplyFormatter.buildHandoffMessage(),
        safe: false,
        handoffRequired: true,
        needsClarification: false,
        confidence: 0.2,
        reason,
        action: 'handoff',
        sources: [],
        tagsToApply: ['sensitive', 'handoff'],
        blockedReason: safety.reason ?? null,
        allowHandoffReply: true,
        provider: 'backend',
        model:
          reason === 'customer_requested_human'
            ? 'customer_request_handoff'
            : 'safety_handoff',
      });

      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    if (
      this.shouldTreatAsOrderDetailsReceived({
        message,
        detectedIntent,
        history,
        conversation,
      })
    ) {
      const response = this.buildBaseResponse({
        intent: 'ORDER_DETAILS_RECEIVED',
        answer: this.buildOrderDetailsReceivedAnswer(),
        safe: true,
        handoffRequired: true,
        needsClarification: false,
        confidence: 0.85,
        reason: 'order_details_received',
        action: 'reply_and_handoff',
        sources: [],
        tagsToApply: ['order', 'order_details', 'handoff'],
        allowHandoffReply: true,
        provider: 'backend',
        model: 'order_details_received',
        metadata: {
          orderDetailsReceived: true,
          paymentMethod: this.extractPaymentMethod(message),
          recentOrderRequest: this.didRecentAssistantAskForOrderDetails(
            history,
            conversation,
          ),
        },
      });

      await this.updateConversationBusinessContext(conversation, {
        customerIntent: 'ASK_ORDER',
        nextAction: 'order_validation_required',
        lastAiDecision: this.stringifyAiDecision(response),
      });
      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    const ragQuery =
      detectedIntent === 'ASK_SERVICES'
        ? `${message} services offres menu plats prix commande livraison paiement horaires contact`
        : detectedIntent === 'ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS'
          ? `${message} livraison zone adresse japon japonais plats japonais sushi disponibilite`
        : detectedIntent === 'ASK_DISH_AVAILABILITY'
        ? `${message} disponible catalogue produits services options menu stock`
        : detectedIntent === 'ASK_MENU'
          ? `${message} menu plats repas disponibles options catalogue produits services`
          : detectedIntent === 'ASK_PRICE'
            ? `${message} prix tarifs cout options quantite disponibilite`
          : detectedIntent === 'ASK_DELIVERY'
            ? `${message} livraison zones couvertes adresse localisation sfax tunisie`
          : detectedIntent === 'ASK_PAYMENT'
            ? `${message} paiement modes paypal especes livraison validation confirmation`
          : detectedIntent === 'ASK_ORDER'
            ? `${message} commande quantite nom telephone adresse livraison paiement validation`
            : detectedIntent === 'ASK_CONTACT'
              ? `${message} contact adresse localisation horaires whatsapp livraison`
          : message;

    this.logger.log(
      `RAG_SEARCH_STARTED conversationId=${conversation?.id ?? payload.conversationId ?? 'null'} companyId=${resolvedCompanyId} intent=${detectedIntent} messageType=${messageType}`,
    );
    const rag = await this.ragService.query({
      query: ragQuery,
      history,
      language: undefined,
      companyId: resolvedCompanyId,
      intent: detectedIntent,
      allowedCategories,
    });
    this.logger.log(
      `RAG_SEARCH_RESULT conversationId=${conversation?.id ?? payload.conversationId ?? 'null'} companyId=${resolvedCompanyId} sources=${rag.sources.length} reliable=${rag.hasReliableSources} confidence=${rag.confidence}`,
    );
    this.logAiReplyState({
      conversationId: payload.conversationId ?? conversation?.id ?? null,
      companyId: resolvedCompanyId,
      botPaused: conversation?.botPaused ?? null,
      ragSourceCount: rag.sources.length,
    });

    if (this.canAnswerWithoutBusinessKnowledge(detectedIntent, message)) {
      return this.generateSocialReply({
        payload,
        conversation,
        startedAt,
        message,
        history,
        companyName,
        detectedIntent,
        ragConfidence: rag.confidence,
      });
    }

    if (!rag.hasReliableSources) {
      const response = this.buildBaseResponse({
        intent: detectedIntent,
        answer: this.buildMissingKnowledgeAnswer(),
        safe: true,
        handoffRequired: true,
        needsClarification: false,
        confidence: rag.confidence,
        reason: 'no_reliable_knowledge_base_answer',
        action: 'handoff',
        sources: [],
        tagsToApply: ['kb_missing', 'handoff'],
        allowHandoffReply: true,
        provider: 'backend',
        model: 'rag_handoff',
        metadata: {
          ragConfidence: rag.confidence,
          ragSources: rag.sources,
          ragSourcesFound: false,
          kbFilteredChunks: rag.evidences.length,
        },
      });

      this.logger.warn(
        `AI handoff required: conversationId=${payload.conversationId ?? conversation?.id ?? 'null'} companyId=${resolvedCompanyId} reason=${response.reason} ragFilteredChunks=${rag.evidences.length} confidence=${rag.confidence}`,
      );

      await this.updateConversationBusinessContext(conversation, {
        customerIntent: response.intent,
        nextAction: 'human_review_missing_kb',
        lastAiDecision: this.stringifyAiDecision(response),
      });
      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    if (
      detectedIntent === 'ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS'
    ) {
      const response = this.buildBaseResponse({
        intent: detectedIntent,
        answer: this.buildDeliveryOrProductAmbiguousAnswer(rag.evidences),
        safe: true,
        handoffRequired: false,
        needsClarification: true,
        confidence: Math.max(0.7, rag.confidence),
        reason: 'delivery_or_product_ambiguous',
        action: 'clarify',
        sources: rag.sources.slice(0, 2),
        tagsToApply: ['delivery', 'product_ambiguous', 'clarification'],
        provider: 'backend',
        model: 'delivery_product_clarifier',
        metadata: {
          ragConfidence: rag.confidence,
          ragSources: rag.sources,
          ragSourcesFound: rag.hasReliableSources,
        },
      });

      await this.updateConversationBusinessContext(conversation, {
        customerIntent: response.intent,
        nextAction: 'ask_clarification',
        lastAiDecision: this.stringifyAiDecision(response),
      });

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    const directPriceAnswer =
      detectedIntent === 'ASK_PRICE'
        ? this.buildPriceAnswerFromEvidence(message, rag.evidences)
        : null;

    if (directPriceAnswer) {
      const response = this.buildBaseResponse({
        intent: detectedIntent,
        answer: directPriceAnswer,
        safe: true,
        handoffRequired: false,
        needsClarification: false,
        confidence: Math.max(0.75, rag.confidence),
        reason: 'answered_from_knowledge_base',
        action: 'reply_ready',
        sources: rag.sources.slice(0, 1),
        tagsToApply: ['price', 'rag'],
        provider: 'backend',
        model: 'kb_price_answer',
        metadata: {
          ragConfidence: rag.confidence,
          ragSources: rag.sources,
          ragSourcesFound: rag.hasReliableSources,
        },
      });

      await this.updateConversationBusinessContext(conversation, {
        customerIntent: response.intent,
        requestedProductService: this.extractRequestedProductService(message),
        nextAction: 'ai_answer_sent',
        lastAiDecision: this.stringifyAiDecision(response),
      });

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    if (detectedIntent === 'ASK_ORDER' && this.isOrderRequestOnly(message)) {
      const response = this.buildBaseResponse({
        intent: detectedIntent,
        answer: this.buildOrderRequestAnswer(),
        safe: true,
        handoffRequired: false,
        needsClarification: false,
        confidence: Math.max(0.75, rag.confidence),
        reason: 'order_information_requested',
        action: 'reply_ready',
        sources: rag.sources.slice(0, 1),
        tagsToApply: ['order'],
        provider: 'backend',
        model: 'order_request_instructions',
        metadata: {
          ragConfidence: rag.confidence,
          ragSources: rag.sources,
          ragSourcesFound: rag.hasReliableSources,
        },
      });

      await this.updateConversationBusinessContext(conversation, {
        customerIntent: 'ASK_ORDER',
        nextAction: 'waiting_for_order_details',
        lastAiDecision: this.stringifyAiDecision(response),
      });

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    const customerEvidenceContext =
      this.customerReplyFormatter.buildCustomerEvidenceContext(rag.evidences);

    const prompt = buildStructuredReplyPrompt({
      message,
      contactName:
        payload.contactName ??
        conversation?.contact.fullName ??
        conversation?.contact.whatsappName ??
        undefined,
      channel: payload.channel,
      history,
      companyName,
      evidenceContext: customerEvidenceContext,
      allowedSourceIds: rag.sources,
      detectedIntent,
      allowedCategories,
      needsClarification: false,
      sensitive: false,
    });

    let generated: Awaited<ReturnType<GeminiService['generateText']>>;
    try {
      this.logger.log(
        `GEMINI_STARTED conversationId=${payload.conversationId ?? conversation?.id ?? 'null'} companyId=${resolvedCompanyId} model=gemini-2.5-flash ragSourcesFound=${rag.hasReliableSources} ragSourceCount=${rag.sources.length}`,
      );
      generated = await this.geminiService.generateText({
        prompt,
        systemInstruction: SYSTEM_PROMPT,
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        maxOutputTokens: 600,
      });
      this.logger.log(
        `GEMINI_RESULT conversationId=${payload.conversationId ?? conversation?.id ?? 'null'} model=${generated.model} textLength=${generated.text.length} textPreview="${this.truncateForLog(generated.text)}"`,
      );
    } catch (error) {
      this.logger.warn(
        `Gemini failed during AI reply: ${this.getSafeErrorMessage(error)}`,
      );

      const response = this.buildBaseResponse({
        intent: this.detectIntent(message),
        answer: this.buildMissingKnowledgeAnswer(),
        safe: true,
        handoffRequired: true,
        needsClarification: false,
        confidence: 0,
        reason: 'gemini_generation_failed',
        action: 'handoff',
        sources: rag.sources,
        tagsToApply: ['ai_error', 'handoff'],
        blockedReason: 'gemini_generation_failed',
        allowHandoffReply: true,
        provider: 'backend',
        model: 'gemini_error_handoff',
        metadata: {
          error: 'gemini_generation_failed',
          ragConfidence: rag.confidence,
          ragSources: rag.sources,
        },
      });

      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
      });
    }

    const parsed = this.parseAgentJson(generated.text);
    if (!parsed) {
      const fallbackAnswer =
        this.extractAnswerFromJsonLikeText(generated.text) ??
        (this.isJsonLikeText(generated.text) ? '' : generated.text.trim());

      const partialAnswerLooksComplete =
        fallbackAnswer.length >= 60 || /[.!?]\s*$/.test(fallbackAnswer);

      if (fallbackAnswer && (!rag.hasReliableSources || partialAnswerLooksComplete)) {
        const formattedFallback =
          this.customerReplyFormatter.formatGeneratedAnswer({
            answer: fallbackAnswer,
            userMessage: message,
            intent: this.detectIntent(message),
            evidences: rag.evidences,
            companyName,
          });
        this.logger.warn(
          `Gemini returned non-JSON text. Using formatted fallback reply: conversationId=${payload.conversationId ?? conversation?.id ?? 'null'} textLength=${formattedFallback.answer.length}`,
        );
        const response = this.buildBaseResponse({
          intent: this.detectIntent(message),
          answer: formattedFallback.answer,
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: Math.max(0.45, rag.confidence),
          reason: formattedFallback.reason ?? 'gemini_text_fallback',
          action: 'reply_ready',
          sources: rag.hasReliableSources ? rag.sources.slice(0, 1) : [],
          tagsToApply: rag.hasReliableSources ? [] : ['kb_missing'],
          metadata: {
            rawGeminiText: generated.text,
            ragConfidence: rag.confidence,
            ragSources: rag.sources,
            ragSourcesFound: rag.hasReliableSources,
          },
        });

        await this.updateConversationBusinessContext(conversation, {
          customerIntent: response.intent,
          nextAction: 'ai_answer_sent',
          lastAiDecision: this.stringifyAiDecision(response),
        });

        return this.finalizeResponse({
          payload,
          conversation,
          startedAt,
          response,
          usage: this.resolveUsage(generated.usage, prompt, response.answer),
        });
      }

      const response = this.buildBaseResponse({
        intent: this.detectIntent(message),
        answer: this.buildMissingKnowledgeAnswer(),
        safe: true,
        handoffRequired: true,
        needsClarification: false,
        confidence: 0.2,
        reason: 'invalid_ai_output',
        action: 'handoff',
        sources: rag.sources,
        tagsToApply: ['ai_invalid_json', 'handoff'],
        allowHandoffReply: true,
        provider: 'backend',
        model: 'gemini_invalid_output_handoff',
        metadata: {
          rawGeminiText: generated.text,
          ragConfidence: rag.confidence,
          ragSources: rag.sources,
          ragSourcesFound: rag.hasReliableSources,
        },
      });

      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        response,
        usage: this.resolveUsage(generated.usage, prompt, response.answer),
      });
    }

    const safeSources = this.keepAllowedSources(parsed.sources ?? [], rag.sources);
    const rawParsedAnswer = parsed.answer?.trim() ?? '';
    const formattedParsedAnswer =
      this.customerReplyFormatter.formatGeneratedAnswer({
        answer: rawParsedAnswer,
        userMessage: message,
        intent: this.normalizeIntent(parsed.intent),
        evidences: rag.evidences,
        companyName,
      });
    const hallucinationCheck = this.hallucinationGuardService.validateReply(
      formattedParsedAnswer.answer,
    );
    const escalation = this.escalationDecisionService.decide(
      message,
      formattedParsedAnswer.answer,
    );
    const confidence = this.normalizeConfidence(
      parsed.confidence,
      rag.confidence,
    );
    const parsedAnswer = formattedParsedAnswer.answer;
    let reason = this.resolveHandoffReason({
      parsedHandoffRequired: Boolean(parsed.handoffRequired),
      escalationShouldHandoff: escalation.shouldEscalate,
      hallucinationValid: hallucinationCheck.valid,
      confidence,
      hasAnswer: Boolean(parsedAnswer),
    });
    if (!reason && !parsedAnswer) {
      reason = 'empty_ai_answer';
    }
    const handoffRequired = Boolean(reason);
    const answer = handoffRequired
      ? Boolean(parsed.handoffRequired) && parsedAnswer
        ? parsedAnswer
        : this.buildMissingKnowledgeAnswer()
      : parsedAnswer;

    this.logger.log(
      `AI parsed decision: conversationId=${payload.conversationId ?? conversation?.id ?? 'null'} canAnswerCandidate=${Boolean(answer)} handoffRequired=${handoffRequired} reason=${reason ?? parsed.reason ?? 'null'} confidence=${confidence} ragSourcesFound=${rag.hasReliableSources}`,
    );

    const response = this.buildBaseResponse({
      intent: this.normalizeIntent(parsed.intent),
      answer,
      safe: hallucinationCheck.valid,
      handoffRequired,
      needsClarification: Boolean(parsed.needsClarification),
      confidence,
      reason:
        reason ??
        formattedParsedAnswer.reason ??
        parsed.reason ??
        'answered_from_knowledge_base',
      action: this.resolveAction({
        handoffRequired,
        needsClarification: Boolean(parsed.needsClarification),
      }),
      sources: safeSources.length > 0 ? safeSources : rag.sources.slice(0, 1),
      tagsToApply: this.normalizeTags(parsed.tagsToApply, {
        addHandoff: handoffRequired,
      }),
      allowHandoffReply: handoffRequired,
      metadata: {
        ragConfidence: rag.confidence,
        ragSources: rag.sources,
        ragSourcesFound: rag.hasReliableSources,
        rawGeminiText: generated.text,
        responseFormatter: {
          replaced: formattedParsedAnswer.replaced,
          reason: formattedParsedAnswer.reason,
        },
      },
    });

    await this.updateConversationBusinessContext(conversation, {
      customerIntent: response.intent,
      requestedProductService:
        parsed.requestedProductService ??
        this.extractRequestedProductService(message),
      requestedDeliveryDate:
        parsed.requestedDeliveryDate ?? this.extractRequestedDeliveryDate(message),
      nextAction:
        parsed.nextAction ??
        (response.handoffRequired
          ? 'human_handoff_required'
          : response.needsClarification
            ? 'ask_clarification'
            : 'ai_answer_sent'),
      lastAiDecision: this.stringifyAiDecision(response),
    });

    if (response.handoffRequired) {
      await this.prepareHandoff(conversation, response.reason);
    }

    return this.finalizeResponse({
      payload,
      conversation,
      startedAt,
      response,
      usage: this.resolveUsage(generated.usage, prompt, response.answer),
    });
  }

  private async generateSocialReply(params: {
    payload: AiReplyRequestDto;
    conversation: ConversationContext | null;
    startedAt: number;
    message: string;
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    companyName: string | null;
    detectedIntent: CustomerIntent;
    ragConfidence: number;
  }): Promise<AiReplyResponseDto> {
    const prompt = this.buildSocialReplyPrompt(params);
    let generated: Awaited<ReturnType<GeminiService['generateText']>> | null =
      null;

    try {
      this.logger.log(
        `GEMINI_STARTED conversationId=${params.payload.conversationId ?? params.conversation?.id ?? 'null'} companyId=${params.payload.companyId ?? params.conversation?.companyId ?? 'null'} model=gemini-2.5-flash ragSourcesFound=false ragSourceCount=0 socialIntent=true`,
      );
      generated = await this.geminiService.generateText({
        prompt,
        systemInstruction:
          'You write short, customer-facing WhatsApp replies for simple social messages. Return strict JSON only. Do not mention internal systems, knowledge bases, RAG, Gemini, transfer, or human handoff. Do not invent business facts.',
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        maxOutputTokens: 220,
      });
      this.logger.log(
        `GEMINI_RESULT conversationId=${params.payload.conversationId ?? params.conversation?.id ?? 'null'} model=${generated.model} textLength=${generated.text.length} textPreview="${this.truncateForLog(generated.text)}"`,
      );
    } catch (error) {
      this.logger.warn(
        `Gemini failed during social reply: ${this.getSafeErrorMessage(error)}`,
      );
    }

    const parsed = generated ? this.parseAgentJson(generated.text) : null;
    const rawAnswer =
      parsed?.answer?.trim() ||
      (generated ? this.extractAnswerFromJsonLikeText(generated.text) : null) ||
      (generated && !this.isJsonLikeText(generated.text)
        ? generated.text.trim()
        : '') ||
      this.buildLocalSocialReply(params.detectedIntent, params.message);
    const formatted = this.customerReplyFormatter.formatGeneratedAnswer({
      answer: rawAnswer,
      userMessage: params.message,
      intent: params.detectedIntent,
      evidences: [],
      companyName: params.companyName,
    });
    const answer =
      params.detectedIntent === 'CUSTOMER_DONE' ||
      this.containsKnowledgeHandoffText(formatted.answer) ||
      formatted.answer === this.customerReplyFormatter.buildHandoffMessage()
        ? this.buildLocalSocialReply(params.detectedIntent, params.message)
        : formatted.answer;
    const confidence = generated
      ? this.normalizeConfidence(parsed?.confidence, Math.max(0.55, params.ragConfidence))
      : 0.45;
    const response = this.buildBaseResponse({
      intent: this.normalizeIntent(
        params.detectedIntent === 'CUSTOMER_DONE'
          ? params.detectedIntent
          : (parsed?.intent ?? params.detectedIntent),
      ),
      answer,
      safe: true,
      handoffRequired: false,
      needsClarification: Boolean(parsed?.needsClarification),
      confidence,
      reason:
        formatted.reason ??
        parsed?.reason ??
        (generated ? 'social_reply_generated' : 'social_reply_backend_fallback'),
      action: 'reply_ready',
      sources: [],
      tagsToApply: Array.from(
        new Set([...(parsed?.tagsToApply ?? []), 'social']),
      ),
      provider: generated ? 'gemini' : 'backend',
      model: generated?.model ?? 'social_reply_fallback',
      metadata: {
        ragSourcesFound: false,
        ragConfidence: params.ragConfidence,
        socialIntent: true,
        ...(generated ? { rawGeminiText: generated.text } : {}),
        responseFormatter: {
          replaced: formatted.replaced,
          reason: formatted.reason,
        },
      },
    });

    await this.updateConversationBusinessContext(params.conversation, {
      customerIntent: response.intent,
      nextAction: 'ai_answer_sent',
      lastAiDecision: this.stringifyAiDecision(response),
    });

    return this.finalizeResponse({
      payload: params.payload,
      conversation: params.conversation,
      startedAt: params.startedAt,
      response,
      usage:
        generated !== null
          ? this.resolveUsage(generated.usage, prompt, response.answer)
          : undefined,
    });
  }

  async summarizeConversation(
    history: Array<{ role: string; content: string }>,
  ): Promise<string | null> {
    if (!history.length) {
      return null;
    }

    const result = await this.geminiService.generateText({
      prompt: buildSummarizerPrompt(history),
      systemInstruction: SYSTEM_PROMPT,
      model: 'gemini-2.5-flash',
      temperature: 0.2,
      maxOutputTokens: 180,
    });

    return result.text || null;
  }

  async generateStructuredOutput<T = Record<string, unknown>>(
    prompt: string,
  ): Promise<StructuredOutputDto<T>> {
    const result = await this.geminiService.generateText({
      prompt,
      systemInstruction: 'Return valid JSON only.',
      model: 'gemini-2.5-flash',
      temperature: 0.1,
      maxOutputTokens: 300,
    });

    try {
      const parsed = JSON.parse(this.normalizeJsonText(result.text)) as T;

      return new StructuredOutputDto<T>({
        success: true,
        data: parsed,
        rawText: result.text,
        error: null,
      });
    } catch {
      return new StructuredOutputDto<T>({
        success: false,
        data: null,
        rawText: result.text,
        error: 'Invalid JSON returned by Gemini.',
      });
    }
  }

  private logAiReplyState(params: {
    conversationId: string | null;
    companyId: string | null;
    botPaused: boolean | null;
    ragSourceCount: number;
  }) {
    this.logger.log(
      `AI reply state: conversationId=${params.conversationId ?? 'null'} companyId=${params.companyId ?? 'null'} botPaused=${params.botPaused ?? 'null'} ragSourceCount=${params.ragSourceCount}`,
    );
  }

  private truncateForLog(value: string, maxLength = 500): string {
    const compact = value.replace(/\s+/g, ' ').trim();

    return compact.length > maxLength
      ? `${compact.slice(0, maxLength)}...`
      : compact;
  }

  private getSafeErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected AI provider error';
  }

  private normalizeWorkflowMessageType(value?: string | null): string {
    const normalized = value?.trim().toLowerCase();

    if (
      normalized === 'text' ||
      normalized === 'image' ||
      normalized === 'audio' ||
      normalized === 'video' ||
      normalized === 'document' ||
      normalized === 'button' ||
      normalized === 'list'
    ) {
      return normalized;
    }

    return 'unknown';
  }

  private validateWorkflowPayload(
    payload: AiReplyRequestDto,
  ): WorkflowValidationResult {
    const missingFields: string[] = [];
    const messageType = this.normalizeWorkflowMessageType(payload.messageType);
    const hasMedia =
      payload.hasMedia === true ||
      ['image', 'audio', 'video', 'document'].includes(messageType);
    const message = (payload.message ?? payload.messageText ?? '').trim();

    if (!payload.companyId?.trim()) missingFields.push('companyId');
    if (!payload.conversationId?.trim()) missingFields.push('conversationId');
    if (!payload.contactId?.trim()) missingFields.push('contactId');
    if (!payload.messageId?.trim()) missingFields.push('messageId');
    if (!payload.phoneNumber?.trim()) missingFields.push('phoneNumber');
    if (!(payload.instanceName ?? payload.instance)?.trim()) {
      missingFields.push('instanceName');
    }
    if (!payload.messageType?.trim()) missingFields.push('messageType');
    if (typeof payload.hasMedia !== 'boolean') missingFields.push('hasMedia');
    if (!payload.rawPayload || typeof payload.rawPayload !== 'object') {
      missingFields.push('rawPayload');
    }

    if (messageType === 'text' && !message && !hasMedia) {
      missingFields.push('messageText');
    }

    if (!missingFields.length) {
      return {
        valid: true,
        missingFields: [],
        reason: 'valid',
      };
    }

    return {
      valid: false,
      missingFields,
      reason: missingFields.includes('companyId')
        ? 'missing_company_id'
        : 'missing_required_fields',
    };
  }

  private buildWorkflowValidationResponse(
    payload: AiReplyRequestDto,
    validation: WorkflowValidationResult,
    startedAt: number,
  ): AiReplyResponseDto {
    const response = new AiReplyResponseDto({
      shouldSendMessage: false,
      canAnswer: false,
      answer: '',
      reply: '',
      replyText: null,
      handoffRequired: true,
      shouldEscalate: true,
      reason: validation.reason,
      escalationReason: validation.reason,
      intent: 'UNKNOWN',
      messageType: this.normalizeWorkflowMessageType(payload.messageType),
      confidence: 0,
      sources: [],
      action: 'handoff',
      safe: true,
      provider: 'backend',
      model: 'validation',
      blockedReason: validation.reason,
      missingFields: validation.missingFields,
      metadata: {
        missingFields: validation.missingFields,
        latencyMs: Date.now() - startedAt,
      },
    });

    this.decorateWorkflowResponse(response, {
      payload,
      conversation: null,
      missingFields: validation.missingFields,
    });

    return response;
  }

  private buildWorkflowErrorResponse(params: {
    payload: AiReplyRequestDto;
    startedAt: number;
    reason: string;
    error: unknown;
  }): AiReplyResponseDto {
    const response = new AiReplyResponseDto({
      shouldSendMessage: false,
      canAnswer: false,
      answer: '',
      reply: '',
      replyText: null,
      handoffRequired: true,
      shouldEscalate: true,
      reason: params.reason,
      escalationReason: params.reason,
      intent: 'UNKNOWN',
      messageType: this.normalizeWorkflowMessageType(params.payload.messageType),
      confidence: 0,
      sources: [],
      action: 'handoff',
      safe: true,
      provider: 'backend',
      model: 'error_guard',
      blockedReason: params.reason,
      metadata: {
        error: this.getSafeErrorMessage(params.error),
        latencyMs: Date.now() - params.startedAt,
      },
    });

    this.decorateWorkflowResponse(response, {
      payload: params.payload,
      conversation: null,
    });

    return response;
  }

  private decorateWorkflowResponse(
    response: AiReplyResponseDto,
    params: {
      payload: AiReplyRequestDto;
      conversation: ConversationContext | null;
      missingFields?: string[];
    },
  ) {
    const replyText = response.reply.trim() || response.answer.trim();
    const allowHandoffReply =
      response.metadata?.allowHandoffReply === true ||
      response.action === 'reply_and_handoff';
    const shouldSendMessage =
      response.shouldSendMessage &&
      Boolean(replyText) &&
      response.canSendFreeForm !== false &&
      (!response.handoffRequired || allowHandoffReply);

    response.shouldSendMessage = shouldSendMessage;
    response.reply = shouldSendMessage ? replyText : '';
    response.replyText = shouldSendMessage ? replyText : null;
    response.canAnswer =
      response.canAnswer && !response.handoffRequired && shouldSendMessage;
    response.intent = this.toWorkflowIntent(response.intent);
    response.messageType = this.normalizeWorkflowMessageType(
      params.payload.messageType,
    );
    response.debug = {
      usedRag:
        response.metadata?.ragSourcesFound === true ||
        Array.isArray(response.metadata?.ragSources),
      usedVision:
        response.metadata?.usedVision === true ||
        (params.payload as AiReplyRequestDto & { __usedVision?: boolean })
          .__usedVision === true,
      usedAudioTranscription:
        response.metadata?.usedAudioTranscription === true,
      usedConversationContext: Boolean(params.conversation),
      companyId:
        params.conversation?.companyId ??
        params.payload.companyId?.trim() ??
        null,
      conversationId:
        params.conversation?.id ??
        params.payload.conversationId?.trim() ??
        null,
    };
    response.metadata = {
      ...(response.metadata ?? {}),
      ...(params.missingFields?.length
        ? { missingFields: params.missingFields }
        : {}),
      workflowResponse: {
        shouldSendMessage: response.shouldSendMessage,
        replyText: response.replyText,
        messageType: response.messageType,
        intent: response.intent,
      },
    };
    response.missingFields = params.missingFields ?? response.missingFields ?? [];
  }

  private toWorkflowIntent(intent?: string | null): string {
    const normalized = intent?.trim().toUpperCase() ?? 'UNKNOWN';
    const map: Record<string, string> = {
      ASK_MENU: 'PRODUCT_AVAILABILITY_QUERY',
      ASK_SERVICES: 'SERVICES_QUERY',
      ASK_DISH_AVAILABILITY: 'PRODUCT_AVAILABILITY_QUERY',
      ASK_PRICE: 'PRICE_QUERY',
      ASK_DELIVERY: 'DELIVERY_QUERY',
      ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS:
        'DELIVERY_OR_PRODUCT_AMBIGUOUS_QUERY',
      ASK_PAYMENT: 'PAYMENT_QUERY',
      ASK_ORDER: 'ORDER_REQUEST',
      ASK_CONTACT: 'SERVICES_QUERY',
      ORDER_DETAILS_RECEIVED: 'ORDER_DETAILS_RECEIVED',
      FOOD_COMPLAINT: 'HUMAN_REVIEW_REQUIRED',
      CUSTOMER_DONE: 'THANK_YOU',
      GREETING: 'GREETING',
      UNKNOWN: 'UNKNOWN_QUERY',
      PRICING: 'PRICE_QUERY',
      PRICE_INQUIRY: 'PRICE_QUERY',
      SERVICES_INQUIRY: 'SERVICES_QUERY',
      DELIVERY_INQUIRY: 'DELIVERY_QUERY',
      ORDER_INQUIRY: 'ORDER_REQUEST',
      AVAILABILITY_INQUIRY: 'PRODUCT_AVAILABILITY_QUERY',
      MENU_INQUIRY: 'PRODUCT_AVAILABILITY_QUERY',
      PAYMENT_INQUIRY: 'PAYMENT_QUERY',
      THANKS: 'THANK_YOU',
      ORDER_STATUS: 'ORDER_REQUEST',
      COMPLAINT: 'HUMAN_REVIEW_REQUIRED',
      DANGEROUS_OR_URGENT_COMPLAINT: 'HUMAN_REVIEW_REQUIRED',
      GREETING_LEGACY: 'GREETING',
    };

    return map[normalized] ?? normalized;
  }

  private toCustomerIntent(intent: AiIntent): CustomerIntent {
    const normalized = String(intent).toUpperCase();
    const map: Record<string, CustomerIntent> = {
      MENU_INQUIRY: 'ASK_MENU',
      SERVICES_INQUIRY: 'ASK_SERVICES',
      PRICE_INQUIRY: 'ASK_PRICE',
      AVAILABILITY_INQUIRY: 'ASK_DISH_AVAILABILITY',
      ORDER_INQUIRY: 'ASK_ORDER',
      DELIVERY_INQUIRY: 'ASK_DELIVERY',
      SERVICES_QUERY: 'ASK_SERVICES',
      PRICE_QUERY: 'ASK_PRICE',
      DELIVERY_QUERY: 'ASK_DELIVERY',
      DELIVERY_OR_PRODUCT_AMBIGUOUS_QUERY:
        'ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS',
      PAYMENT_QUERY: 'ASK_PAYMENT',
      PRODUCT_AVAILABILITY_QUERY: 'ASK_DISH_AVAILABILITY',
      ORDER_REQUEST: 'ASK_ORDER',
      ORDER_DETAILS_RECEIVED: 'ASK_ORDER',
      COMPLAINT: 'FOOD_COMPLAINT',
      DANGEROUS_OR_URGENT_COMPLAINT: 'FOOD_COMPLAINT',
      HUMAN_REVIEW_REQUIRED: 'UNKNOWN',
      GREETING: 'GREETING',
      THANKS: 'CUSTOMER_DONE',
      THANK_YOU: 'CUSTOMER_DONE',
      GOODBYE: 'CUSTOMER_DONE',
      UNKNOWN_QUERY: 'UNKNOWN',
    };

    const supported: CustomerIntent[] = [
      'ASK_MENU',
      'ASK_SERVICES',
      'ASK_DISH_AVAILABILITY',
      'ASK_PRICE',
      'ASK_DELIVERY',
      'ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS',
      'ASK_PAYMENT',
      'ASK_ORDER',
      'ASK_CONTACT',
      'FOOD_COMPLAINT',
      'GREETING',
      'CUSTOMER_DONE',
      'UNKNOWN',
    ];

    return supported.includes(normalized as CustomerIntent)
      ? (normalized as CustomerIntent)
      : (map[normalized] ?? 'UNKNOWN');
  }

  private async understandImageMessage(
    payload: AiReplyRequestDto,
    caption: string,
  ): Promise<ImageUnderstandingResult> {
    const imagePart = this.extractImagePart(payload.rawPayload);

    if (!imagePart) {
      if (caption.trim()) {
        return {
          imageUnderstanding:
            'Image received. No downloadable image content was available in the webhook payload; using the caption as the customer request.',
          detectedIntent: this.detectIntent(caption),
          normalizedQuestion: caption,
          confidence: 0.55,
          usedVision: false,
          failed: false,
        };
      }

      this.logger.warn(
        `IMAGE_DOWNLOAD_FAILED conversationId=${payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'} reason=no_media_reference`,
      );

      return {
        imageUnderstanding:
          'Image received, but no media URL, media key, or inline image data was available to analyze.',
        detectedIntent: 'IMAGE_UNDERSTANDING',
        normalizedQuestion: '',
        confidence: 0,
        usedVision: false,
        failed: true,
      };
    }

    this.logger.log(
      `GEMINI_VISION_STARTED conversationId=${payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'} source=${imagePart.source}`,
    );

    try {
      const result = await this.geminiService.generateImageUnderstanding({
        prompt: [
          'Analyze this WhatsApp customer image for a support assistant.',
          'Return strict JSON with keys: imageUnderstanding, detectedIntent, normalizedQuestion, confidence.',
          'Allowed detectedIntent values: PRICE_QUERY, SERVICES_QUERY, PRODUCT_AVAILABILITY_QUERY, ORDER_REQUEST, DELIVERY_QUERY, DELIVERY_OR_PRODUCT_AMBIGUOUS_QUERY, PAYMENT_QUERY, HUMAN_REVIEW_REQUIRED, COMPLAINT, DANGEROUS_OR_URGENT_COMPLAINT, IMAGE_UNDERSTANDING, UNKNOWN_QUERY.',
          caption ? `Caption: ${caption}` : 'Caption: none',
        ].join('\n'),
        mimeType: imagePart.mimeType,
        data: imagePart.data,
        mediaUrl: imagePart.mediaUrl,
        model: 'gemini-2.5-flash',
      });
      const parsed = this.parseImageUnderstandingJson(result.text);

      this.logger.log(
        `GEMINI_VISION_RESULT conversationId=${payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'} intent=${parsed.detectedIntent} confidence=${parsed.confidence}`,
      );

      return {
        ...parsed,
        usedVision: true,
        failed: false,
      };
    } catch (error) {
      this.logger.warn(
        `GEMINI_VISION_RESULT conversationId=${payload.conversationId ?? 'null'} messageId=${payload.messageId ?? 'null'} error=${this.getSafeErrorMessage(error)}`,
      );

      if (caption.trim()) {
        return {
          imageUnderstanding:
            'Image understanding failed. Continuing with the customer caption.',
          detectedIntent: this.detectIntent(caption),
          normalizedQuestion: caption,
          confidence: 0.45,
          usedVision: false,
          failed: false,
        };
      }

      return {
        imageUnderstanding: 'Image understanding failed.',
        detectedIntent: 'IMAGE_UNDERSTANDING',
        normalizedQuestion: '',
        confidence: 0,
        usedVision: false,
        failed: true,
      };
    }
  }

  private extractImagePart(rawPayload?: Record<string, unknown>): {
    source: string;
    mimeType: string;
    data?: string;
    mediaUrl?: string;
  } | null {
    if (!rawPayload) {
      return null;
    }

    const imageMessage = this.findNestedRecord(rawPayload, 'imageMessage');
    const candidates = [
      imageMessage?.jpegThumbnail,
      imageMessage?.base64,
      imageMessage?.media,
      imageMessage?.url,
      imageMessage?.directPath,
      this.findNestedValue(rawPayload, 'mediaUrl'),
      this.findNestedValue(rawPayload, 'url'),
    ];
    const mimeType =
      this.findNestedString(rawPayload, 'mimetype') ??
      this.findNestedString(rawPayload, 'mimeType') ??
      'image/jpeg';

    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        continue;
      }

      const value = candidate.trim();
      if (/^https?:\/\//i.test(value)) {
        return {
          source: 'media_url',
          mimeType,
          mediaUrl: value,
        };
      }

      const dataUrlMatch = value.match(/^data:([^;]+);base64,(.+)$/i);
      if (dataUrlMatch?.[2]) {
        return {
          source: 'data_url',
          mimeType: dataUrlMatch[1] || mimeType,
          data: dataUrlMatch[2],
        };
      }

      if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 80) {
        return {
          source: 'inline_base64',
          mimeType,
          data: value.replace(/\s+/g, ''),
        };
      }
    }

    return null;
  }

  private parseImageUnderstandingJson(rawText: string): Omit<
    ImageUnderstandingResult,
    'usedVision' | 'failed'
  > {
    const fallback: Omit<ImageUnderstandingResult, 'usedVision' | 'failed'> = {
      imageUnderstanding: rawText.trim() || 'Image analyzed.',
      detectedIntent: 'IMAGE_UNDERSTANDING',
      normalizedQuestion: rawText.trim(),
      confidence: 0.5,
    };

    try {
      const parsed = JSON.parse(this.normalizeJsonText(rawText)) as Record<
        string,
        unknown
      >;
      const detectedIntent =
        typeof parsed.detectedIntent === 'string'
          ? (parsed.detectedIntent as AiIntent)
          : fallback.detectedIntent;
      const confidence =
        typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
          ? Math.max(0, Math.min(1, parsed.confidence))
          : fallback.confidence;

      return {
        imageUnderstanding:
          typeof parsed.imageUnderstanding === 'string'
            ? parsed.imageUnderstanding
            : fallback.imageUnderstanding,
        detectedIntent,
        normalizedQuestion:
          typeof parsed.normalizedQuestion === 'string'
            ? parsed.normalizedQuestion
            : fallback.normalizedQuestion,
        confidence,
      };
    } catch {
      return fallback;
    }
  }

  private findNestedRecord(
    value: unknown,
    key: string,
  ): Record<string, unknown> | null {
    const found = this.findNestedValue(value, key);

    return found && typeof found === 'object' && !Array.isArray(found)
      ? (found as Record<string, unknown>)
      : null;
  }

  private findNestedString(value: unknown, key: string): string | null {
    const found = this.findNestedValue(value, key);

    return typeof found === 'string' && found.trim() ? found.trim() : null;
  }

  private findNestedValue(value: unknown, key: string): unknown {
    if (!value || typeof value !== 'object') {
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findNestedValue(item, key);
        if (found !== null && found !== undefined) return found;
      }
      return null;
    }

    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }

    for (const nested of Object.values(record)) {
      const found = this.findNestedValue(nested, key);
      if (found !== null && found !== undefined) return found;
    }

    return null;
  }

  private async getConversationContext(
    conversationId: string,
    companyId?: string,
  ): Promise<ConversationContext | null> {
    return this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
        companyId: true,
        status: true,
        assignedTo: true,
        botPaused: true,
        handoffRequired: true,
        lastCustomerMessageAt: true,
        conversationSummary: true,
        customerIntent: true,
        requestedProductService: true,
        requestedDeliveryDate: true,
        nextAction: true,
        importantNotes: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            whatsappName: true,
            language: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            direction: true,
            senderType: true,
            content: true,
            messageType: true,
          },
        },
      },
    });
  }

  private async getCompanyContext(
    companyId: string,
  ): Promise<CompanyContext | null> {
    return this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
      },
    });
  }

  private buildHistory(
    payload: AiReplyRequestDto,
    conversation: ConversationContext | null,
  ): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    if (payload.history?.length) {
      return payload.history;
    }

    return (conversation?.messages ?? [])
      .slice()
      .reverse()
      .filter((message) => Boolean(message.content?.trim()))
      .map((message) => ({
        role:
          message.direction === 'inbound'
            ? ('user' as const)
            : ('assistant' as const),
        content: message.content ?? '',
      }));
  }

  private buildBaseResponse(params: {
    intent: AiIntent;
    answer: string;
    safe: boolean;
    handoffRequired: boolean;
    needsClarification: boolean;
    confidence: number;
    reason: string | null;
    action: string;
    sources: string[];
    tagsToApply: string[];
    blockedReason?: string | null;
    allowHandoffReply?: boolean;
    provider?: string;
    model?: string;
    metadata?: Record<string, unknown>;
  }): AiReplyResponseDto {
    const leakedInternalContent =
      params.answer.trim().length > 0 &&
      this.customerReplyFormatter.containsForbiddenLeak(params.answer);
    const requestedHandoff = params.handoffRequired || leakedInternalContent;
    const answer = leakedInternalContent
      ? this.customerReplyFormatter.buildHandoffMessage()
      : params.answer;
    const handoffRequired = requestedHandoff;
    const allowHandoffReply =
      Boolean(params.allowHandoffReply) || leakedInternalContent;
    const reason = leakedInternalContent
      ? 'forbidden_internal_content_blocked'
      : params.reason;
    const reply =
      handoffRequired && !allowHandoffReply ? '' : answer.trim();
    const canAnswer =
      !handoffRequired &&
      params.action !== 'ignored' &&
      (params.needsClarification || Boolean(reply));
    const shouldSendMessage =
      params.action !== 'ignored' &&
      Boolean(reply) &&
      (canAnswer || allowHandoffReply);

    return new AiReplyResponseDto({
      shouldSendMessage,
      intent: params.intent,
      answer,
      reply,
      replyText: shouldSendMessage ? reply : null,
      canAnswer,
      provider: params.provider ?? 'gemini',
      model: params.model ?? 'gemini-2.5-flash',
      safe: params.safe,
      canSendFreeForm: true,
      handoffRequired,
      needsClarification: params.needsClarification,
      reason,
      sources: params.sources,
      tagsToApply: leakedInternalContent
        ? Array.from(new Set([...params.tagsToApply, 'handoff', 'kb_leak_blocked']))
        : params.tagsToApply,
      shouldEscalate: handoffRequired,
      escalationReason: handoffRequired ? reason : null,
      confidence: params.confidence,
      summary: null,
      blockedReason: leakedInternalContent
        ? 'forbidden_internal_content_blocked'
        : (params.blockedReason ?? null),
      action:
        handoffRequired && params.action !== 'ignored' && !allowHandoffReply
          ? 'handoff'
          : params.action,
      messageType: 'unknown',
      metadata: {
        ...(params.metadata ?? {}),
        ...(leakedInternalContent ? { internalContentBlocked: true } : {}),
        allowHandoffReply,
        freeFormPolicy: {
          mode: 'always_open',
          canSendFreeForm: true,
        },
      },
    });
  }

  private canAnswerWithoutBusinessKnowledge(
    intent: CustomerIntent,
    message: string,
  ): boolean {
    if (intent === 'CUSTOMER_DONE') {
      return true;
    }

    if (intent !== 'GREETING') {
      return false;
    }

    const normalized = this.normalizeText(message);
    const words = normalized
      .split(/[^\p{L}\p{N}]+/u)
      .map((word) => word.trim())
      .filter(Boolean);

    return (
      words.length > 0 &&
      words.length <= 3 &&
      words.every((word) =>
        ['bonjour', 'bonsoir', 'salut', 'salam', 'hello', 'hi', 'hey'].includes(
          word,
        ),
      )
    );
  }

  private buildSocialReplyPrompt(params: {
    message: string;
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    companyName: string | null;
    detectedIntent: CustomerIntent;
  }): string {
    const history = params.history
      .slice(-4)
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n');

    return [
      'Generate one short WhatsApp reply for a simple social customer message.',
      'This is not a business knowledge question, so do not include prices, menu items, availability, services, contact details, policies, or claims about the company.',
      'Use the same language as the customer when it is clear.',
      'For a greeting, greet back and ask how you can help.',
      'For thanks or a closing message, acknowledge politely and stay available.',
      'Never mention internal systems, base de connaissances, knowledge base, RAG, Gemini, handoff, escalation, escalade, transfer, transfert, transmitting the request, human agents, agent humain, internal support, review interne, source IDs, article IDs, metadata, or internal notes.',
      'Return strict JSON only with keys: intent, answer, requestedProductService, requestedDeliveryDate, nextAction, confidence, handoffRequired, needsClarification, sources, tagsToApply, reason.',
      `Company name: ${params.companyName ?? 'Unknown'}`,
      `Detected intent: ${params.detectedIntent}`,
      `Recent conversation:\n${history || 'No recent conversation.'}`,
      `Customer message:\n${params.message}`,
    ].join('\n\n');
  }

  private containsKnowledgeHandoffText(answer: string): boolean {
    return this.customerReplyFormatter.containsForbiddenLeak(answer);
  }

  private buildLocalSocialReply(intent: CustomerIntent, message: string): string {
    if (intent === 'CUSTOMER_DONE') {
      return 'De rien ! Nous vous tiendrons informé dès que possible.';
    }

    const normalized = this.normalizeText(message);

    if (/\bbonsoir\b/.test(normalized)) {
      return 'Bonsoir, comment puis-je vous aider ?';
    }

    if (/\bsalam\b/.test(normalized)) {
      return 'Salam, comment puis-je vous aider ?';
    }

    if (/\b(?:hello|hi|hey)\b/.test(normalized)) {
      return 'Hello, how can I help you?';
    }

    return 'Bonjour, comment puis-je vous aider ?';
  }

  private buildMissingKnowledgeAnswer(): string {
    return "Nous avons bien recu votre demande. Elle necessite une verification complementaire et notre equipe vous repondra des que possible.";
  }

  private buildDeliveryOrProductAmbiguousAnswer(
    evidences: Array<{
      content: string;
      metadata?: Record<string, unknown>;
    }>,
  ): string {
    const evidenceText = this.normalizeText(
      evidences
        .map((evidence) =>
          [evidence.content, JSON.stringify(evidence.metadata ?? {})].join(' '),
        )
        .join(' '),
    );
    const hasJapaneseProductInfo =
      /\bjapon(?:ais|aise|aises)?\b|\bsushi\b|\bplats?\s+japonais\b/.test(
        evidenceText,
      );
    const productSentence = hasJapaneseProductInfo
      ? ' Nous pouvons proposer des plats d’inspiration japonaise selon disponibilité.'
      : '';

    return [
      'Voulez-vous dire si nous proposons des plats japonais, ou si nous livrons vers une zone précise ?',
      productSentence.trim(),
      'Pour la livraison, merci de préciser votre adresse ou localisation afin de vérifier la zone.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildPriceAnswerFromEvidence(
    message: string,
    evidences: Array<{
      content: string;
      metadata?: Record<string, unknown>;
    }>,
  ): string | null {
    const pricedItems = this.collectPricedItems(evidences);

    if (!pricedItems.length) {
      return null;
    }

    const normalizedMessage = this.normalizeText(message);
    const requestedItem = this.extractPriceItemCandidate(message);
    const matched =
      pricedItems.find((item) => {
        const normalizedItem = this.normalizeText(item.item);

        return (
          normalizedMessage.includes(normalizedItem) ||
          (requestedItem
            ? normalizedItem.includes(requestedItem) ||
              requestedItem.includes(normalizedItem)
            : false)
        );
      }) ?? null;

    if (!matched) {
      return null;
    }

    return `Le prix ${this.formatPriceItemForSentence(
      matched.item,
    )} est de ${matched.price}. Ce prix peut varier selon les options, la quantité et la disponibilité.`;
  }

  private collectPricedItems(
    evidences: Array<{
      content: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Array<{ item: string; price: string }> {
    return evidences.flatMap((evidence) => {
      const metadata =
        evidence.metadata?.metadata && typeof evidence.metadata.metadata === 'object'
          ? (evidence.metadata.metadata as Record<string, unknown>)
          : {};
      const pricedItems = metadata.pricedItems;

      if (!pricedItems || typeof pricedItems !== 'object' || Array.isArray(pricedItems)) {
        return [];
      }

      return Object.entries(pricedItems as Record<string, unknown>)
        .map(([item, price]) => ({
          item: item.trim(),
          price: typeof price === 'string' ? price.trim() : '',
        }))
        .filter((item) => item.item.length > 0 && item.price.length > 0);
    });
  }

  private extractPriceItemCandidate(message: string): string | null {
    const candidate = this.normalizeText(message)
      .replace(
        /\b(?:prix|tarif|tarifs|combien|cout|coute|coûte|de|du|des|le|la|les|un|une|pour|svp|please)\b/g,
        ' ',
      )
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return candidate || null;
  }

  private formatPriceItemForSentence(item: string): string {
    const normalized = this.normalizeText(item);
    const label = item.trim().toLowerCase();

    if (normalized === 'pizza') {
      return 'de la pizza';
    }

    if (/^(salade|boisson|chorba)\b/.test(normalized)) {
      return `de la ${label}`;
    }

    if (/^[aeiouh]/.test(normalized)) {
      return `de l’${label}`;
    }

    return `du ${label}`;
  }

  private buildOrderRequestAnswer(): string {
    return 'Pour passer une commande, veuillez m’envoyer le nom des plats souhaités, les quantités, votre nom, votre numéro de téléphone, votre adresse de livraison ou localisation, et votre mode de paiement. Je récapitulerai ensuite votre commande pour confirmation.';
  }

  private buildOrderDetailsReceivedAnswer(): string {
    return 'Merci, j’ai bien reçu vos informations de commande. Nous allons vérifier la disponibilité, le total et le mode de paiement, puis vous confirmer rapidement.';
  }

  private extractPaymentMethod(message: string): string | null {
    const normalized = this.normalizeText(message);

    if (/\bpaypal\b/.test(normalized)) {
      return 'PayPal';
    }

    if (/\b(?:cash|espece|especes)\b/.test(normalized)) {
      return 'espèces';
    }

    if (/\b(?:carte|visa|mastercard|master\s*card)\b/.test(normalized)) {
      return 'carte bancaire';
    }

    return null;
  }

  private isOrderRequestOnly(message: string): boolean {
    const normalized = this.normalizeText(message);

    if (this.hasOrderDetails(message)) {
      return false;
    }

    return [
      /passer\s+(?:une\s+)?commande/i,
      /je\s+(?:veux|voudrais|souhaite)\s+(?:passer\s+)?(?:une\s+)?commande/i,
      /comment\s+commander/i,
      /\b(?:commander|commande)\b/i,
      /\u0646\u062d\u0628\s+\u0646\u0637\u0644\u0628|\u0643\u0648\u0645\u0648\u0646\u062f/i,
    ].some((pattern) => pattern.test(normalized));
  }

  private shouldTreatAsOrderDetailsReceived(params: {
    message: string;
    detectedIntent: CustomerIntent;
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    conversation: ConversationContext | null;
  }): boolean {
    const recentOrderRequest = this.didRecentAssistantAskForOrderDetails(
      params.history,
      params.conversation,
    );
    const conversationOrderContext =
      params.conversation?.customerIntent === 'ASK_ORDER' ||
      /order|commande/i.test(params.conversation?.nextAction ?? '');

    return (
      (recentOrderRequest || conversationOrderContext) &&
      this.hasOrderDetailSignal(params.message)
    );
  }

  private didRecentAssistantAskForOrderDetails(
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    conversation: ConversationContext | null,
  ): boolean {
    const historyTexts = history
      .slice(-6)
      .filter((item) => item.role === 'assistant')
      .map((item) => item.content);
    const conversationTexts = (conversation?.messages ?? [])
      .slice(0, 6)
      .filter(
        (message) =>
          message.direction === 'outbound' ||
          message.senderType === 'bot' ||
          message.senderType === 'assistant',
      )
      .map((message) => message.content ?? '');

    return [...historyTexts, ...conversationTexts].some((content) =>
      this.isOrderDetailsRequestText(content),
    );
  }

  private isOrderDetailsRequestText(content: string): boolean {
    const normalized = this.normalizeText(content);
    const asksForOrder =
      /passer\s+(?:votre\s+)?commande|confirmer\s+(?:la\s+)?commande|votre\s+commande|commande/i.test(
        normalized,
      );
    const asksForDetails = [
      /quantit[eé]s?/i,
      /\bnom\b/i,
      /t[eé]l[eé]phone|numero|num[eé]ro/i,
      /adresse|ville|localisation|position/i,
      /paiement|mode\s+de\s+paiement/i,
    ].filter((pattern) => pattern.test(normalized)).length;

    return asksForOrder && asksForDetails >= 2;
  }

  private hasOrderDetails(message: string): boolean {
    if (this.customerIntentService.looksLikeOrderDetails(message)) {
      return true;
    }

    const normalized = this.normalizeText(message);
    const hasQuantity = /\b\d+\s*(?:plat|plats|piece|pieces|pi[eè]ce|pi[eè]ces|x)?\b/i.test(
      normalized,
    );
    const hasPhone = /(?:\+?\d[\s.-]*){8,}/.test(message);
    const hasPayment = /paiement|cash|espece|especes|carte|visa|mastercard|virement|paypal|mobile\s*money|mobile/i.test(
      normalized,
    );
    const hasAddress = /adresse|livraison|sfax|tunis|ariana|sousse|tunisia|tunisie|localisation|position/i.test(
      normalized,
    );

    return (
      (hasQuantity && (hasPhone || hasPayment || hasAddress)) ||
      (hasPhone && (hasPayment || hasAddress) && this.hasLikelyCustomerName(message))
    );
  }

  private hasOrderDetailSignal(message: string): boolean {
    const normalized = this.normalizeText(message);
    const hasPhone = /(?:\+?\d[\s.-]*){8,}/.test(message);
    const hasPayment = /paiement|cash|espece|especes|carte|visa|mastercard|virement|paypal|mobile\s*money|mobile/i.test(
      normalized,
    );
    const hasAddress = /adresse|livraison|sfax|tunis|ariana|sousse|tunisia|tunisie|localisation|position/i.test(
      normalized,
    );

    return (
      this.hasOrderDetails(message) ||
      (this.hasLikelyCustomerName(message) && (hasPhone || hasPayment || hasAddress)) ||
      (hasPhone && (hasPayment || hasAddress))
    );
  }

  private hasLikelyCustomerName(message: string): boolean {
    const stopwords = new Set([
      'adresse',
      'livraison',
      'paiement',
      'paypal',
      'cash',
      'carte',
      'visa',
      'mastercard',
      'mobile',
      'money',
      'sfax',
      'tunis',
      'tunisia',
      'tunisie',
      'commande',
      'plat',
      'plats',
    ]);
    const words = this.normalizeText(message)
      .split(/[^\p{L}]+/u)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && !stopwords.has(word));

    return words.length >= 2;
  }

  private capitalize(value: string): string {
    const trimmed = value.trim();

    return trimmed ? `${trimmed[0].toUpperCase()}${trimmed.slice(1)}` : trimmed;
  }

  private normalizeMenuItem(value: string): string {
    return this.normalizeText(value)
      .replace(/^(?:du|de la|de l'|des|le|la|les|un|une)\s+/i, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private rankKnowledgeFallbackEvidence(
    evidence: {
      content: string;
      score: number;
      metadata?: Record<string, unknown>;
    },
    tokens: string[],
  ): number {
    const title = this.normalizeText(
      typeof evidence.metadata?.articleTitle === 'string'
        ? evidence.metadata.articleTitle
        : '',
    );
    const matchedTokens = Array.isArray(evidence.metadata?.matchedTokens)
      ? evidence.metadata.matchedTokens.map((token) => String(token))
      : [];
    const titleBonus = tokens.some((token) => title.includes(token)) ? 0.3 : 0;
    const matchedTokenBonus = matchedTokens.length * 0.05;

    return evidence.score + titleBonus + matchedTokenBonus;
  }

  private tokenizeForKnowledgeFallback(value: string): string[] {
    const stopWords = new Set([
      'avec',
      'dans',
      'des',
      'est',
      'les',
      'que',
      'une',
      'vos',
      'vous',
      'veux',
      'votre',
    ]);

    return Array.from(
      new Set(
        this.normalizeText(value)
          .split(/[^a-z0-9]+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 3 && !stopWords.has(token)),
      ),
    );
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u064B-\u065F\u0670]/g, '');
  }

  private async updateConversationBusinessContext(
    conversation: ConversationContext | null,
    updates: {
      customerIntent?: string | null;
      requestedProductService?: string | null;
      requestedDeliveryDate?: string | null;
      nextAction?: string | null;
      lastAiDecision?: string | null;
      importantNotes?: string | null;
    },
  ) {
    if (!conversation) {
      return;
    }

    const data = this.compactContextUpdate(updates);

    if (Object.keys(data).length === 0) {
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    Object.assign(conversation, data);
  }

  private compactContextUpdate(updates: {
    customerIntent?: string | null;
    requestedProductService?: string | null;
    requestedDeliveryDate?: string | null;
    nextAction?: string | null;
    lastAiDecision?: string | null;
    importantNotes?: string | null;
  }) {
    return Object.fromEntries(
      Object.entries(updates)
        .map(([key, value]) => [
          key,
          typeof value === 'string' ? value.trim() : value,
        ])
        .filter(([, value]) => typeof value === 'string' && value.length > 0),
    );
  }

  private async finalizeResponse(params: {
    payload: AiReplyRequestDto;
    conversation: ConversationContext | null;
    startedAt: number;
    response: AiReplyResponseDto;
    usage?: UsageSnapshot;
  }): Promise<AiReplyResponseDto> {
    const windowStatus = this.conversationWindowService.checkWindow(
      params.conversation?.lastCustomerMessageAt,
    );

    params.response.canSendFreeForm = windowStatus.canSendFreeForm;
    params.response.metadata = {
      ...(params.response.metadata ?? {}),
      freeFormPolicy: {
        mode: 'customer_service_window_24h',
        canSendFreeForm: windowStatus.canSendFreeForm,
        remainingHours: windowStatus.remainingHours,
        expiresAt: windowStatus.expiresAt?.toISOString() ?? null,
        reason: windowStatus.reason,
      },
    };

    if (params.response.canAnswer && !windowStatus.canSendFreeForm) {
      const blockedAnswer = params.response.answer;
      params.response.canAnswer = false;
      params.response.handoffRequired = true;
      params.response.shouldEscalate = true;
      params.response.shouldSendMessage = false;
      params.response.reason = 'whatsapp_24h_window_expired';
      params.response.escalationReason = 'whatsapp_24h_window_expired';
      params.response.action = 'handoff';
      params.response.reply = '';
      params.response.replyText = null;
      params.response.metadata = {
        ...(params.response.metadata ?? {}),
        unsentReplyText: blockedAnswer,
      };
    }

    if (params.response.canAnswer && !params.response.handoffRequired) {
      await this.clearPendingHandoff(params.conversation);
    }

    const usage =
      params.usage ??
      this.resolveUsage(
        undefined,
        params.payload.message ?? params.payload.messageText ?? '',
        params.response.answer,
      );
    const aiRun = await this.aiRunsRepository.create({
      companyId: params.conversation?.companyId ?? params.payload.companyId,
      conversationId: params.conversation?.id ?? params.payload.conversationId,
      messageId:
        params.payload.messageId ??
        this.findLatestInboundMessageId(params.conversation) ??
        params.payload.contactId ??
        'manual',
      contactId: params.payload.contactId,
      prompt: params.payload.message ?? params.payload.messageText ?? '',
      inputType: params.payload.messageType ?? 'text',
      response: params.response.answer,
      intent: params.response.intent,
      provider: params.response.provider,
      model: params.response.model,
      status: params.response.action === 'ignored' ? 'blocked' : 'success',
      reason: params.response.reason ?? undefined,
      shouldSendMessage: params.response.shouldSendMessage,
      imageAnalysisResult: this.optionalRecord(
        params.response.metadata?.imageAnalysisResult,
      ),
      matchedProductId:
        typeof params.response.metadata?.matchedProductId === 'string'
          ? params.response.metadata.matchedProductId
          : null,
      latencyMs: Date.now() - params.startedAt,
      promptTokens: usage.promptTokens ?? undefined,
      completionTokens: usage.completionTokens ?? undefined,
      tokensUsed: usage.totalTokens ?? undefined,
      confidenceScore: params.response.confidence,
      blockedReason: params.response.blockedReason ?? undefined,
      handoffRequired: params.response.handoffRequired,
      tagsToApply: params.response.tagsToApply,
      metadata: {
        output: {
          intent: params.response.intent,
          answer: params.response.answer,
          reply: params.response.reply,
          canAnswer: params.response.canAnswer,
          confidence: params.response.confidence,
          handoffRequired: params.response.handoffRequired,
          needsClarification: params.response.needsClarification,
          canSendFreeForm: params.response.canSendFreeForm,
          reason: params.response.reason,
          sources: params.response.sources,
          tagsToApply: params.response.tagsToApply,
          action: params.response.action,
          shouldSendMessage: params.response.shouldSendMessage,
          replyText: params.response.replyText,
        },
        usage,
        metadata: params.response.metadata ?? {},
      },
    });

    this.decorateWorkflowResponse(params.response, {
      payload: params.payload,
      conversation: params.conversation,
    });

    params.response.aiRunId = aiRun.id;
    params.response.metadata = {
      ...(params.response.metadata ?? {}),
      aiRunId: aiRun.id,
      latencyMs: Date.now() - params.startedAt,
      usage,
    };

    this.logger.log(
      `AI_REPLY_FINAL_DECISION conversationId=${params.conversation?.id ?? params.payload.conversationId ?? 'null'} aiRunId=${aiRun.id} shouldSendMessage=${params.response.shouldSendMessage} canAnswer=${params.response.canAnswer} handoffRequired=${params.response.handoffRequired} replyLength=${params.response.reply.length} outputLength=${params.response.answer.length} reason=${params.response.reason ?? 'null'} provider=${params.response.provider} model=${params.response.model} sources=${params.response.sources.length} confidence=${params.response.confidence}`,
    );

    return params.response;
  }

  private async clearPendingHandoff(conversation: ConversationContext | null) {
    if (!conversation || conversation.status === 'closed' || conversation.assignedTo) {
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'bot_active',
        handoffRequired: false,
        botPaused: false,
        updatedAt: new Date(),
      },
    });

    conversation.status = 'bot_active';
    conversation.handoffRequired = false;
    conversation.botPaused = false;
  }

  private async prepareHandoff(
    conversation: ConversationContext | null,
    reason: string | null,
  ) {
    if (!conversation) {
      return;
    }

    this.logger.warn(
      `HANDOFF_REQUIRED conversationId=${conversation.id} companyId=${conversation.companyId ?? 'null'} reason=${reason ?? 'handoff_required'}`,
    );

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: conversation.status === 'closed' ? 'closed' : 'human_assigned',
        priority: 'high',
        handoffRequired: true,
        botPaused: true,
        updatedAt: new Date(),
      },
    });

    conversation.status =
      conversation.status === 'closed' ? 'closed' : 'human_assigned';
    conversation.handoffRequired = true;
    conversation.botPaused = true;

    await this.notifyHandoffRequired(conversation, reason);
  }

  private async notifyHandoffRequired(
    conversation: ConversationContext,
    reason: string | null,
  ) {
    if (!conversation.companyId || conversation.status === 'closed') {
      return;
    }

    const existing = await this.prisma.notification.findFirst({
      where: {
        companyId: conversation.companyId,
        conversationId: conversation.id,
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

    const type =
      reason === 'customer_requested_human'
        ? NotificationType.CUSTOMER_REQUEST_HUMAN
        : reason === 'low_ai_confidence' ||
            reason === 'no_reliable_knowledge_base_answer'
          ? NotificationType.AI_LOW_CONFIDENCE
          : NotificationType.HANDOFF_REQUIRED;

    await this.prisma.notification.create({
      data: {
        companyId: conversation.companyId,
        conversationId: conversation.id,
        contactId: conversation.contact.id,
        readByUserId: null,
        type,
        title: 'Support humain requis',
        message: `Conversation transferee au support humain. Raison: ${reason ?? 'handoff_required'}.`,
        priority: NotificationPriority.high,
        isRead: false,
      },
    });
  }

  private hasHumanTakeover(conversation: ConversationContext | null): boolean {
    if (!conversation) {
      return false;
    }

    return (
      conversation.botPaused === true ||
      conversation.status === 'human_assigned' ||
      conversation.status === 'human_handoff' ||
      Boolean(conversation.assignedTo)
    );
  }

  private didCustomerRequestHuman(message: string): boolean {
    return [
      /agent humain/i,
      /human agent/i,
      /talk to human/i,
      /parler a un agent/i,
      /parler à un agent/i,
      /parler a un humain/i,
      /parler à un humain/i,
      /conseiller/i,
      /responsable/i,
      /support humain/i,
      /n7eb\s+(?:insan|nحكي|nahki|n7ki)/i,
      /chkun\s+ynajem\s+y3aweni/i,
    ].some((pattern) => pattern.test(message));
  }

  private detectSensitiveRisk(message: string): boolean {
    return [
      /fraud/i,
      /legal/i,
      /lawsuit/i,
      /plainte/i,
      /refund/i,
      /remboursement/i,
      /cancel/i,
      /angry/i,
      /urgent/i,
      /manager/i,
    ].some((pattern) => pattern.test(message));
  }

  private isUrgentComplaint(message: string): boolean {
    const normalized = this.normalizeText(message);

    return [
      /poison|poisonne|empoisonne|intoxication/i,
      /je\s+suis\s+malade|malade|vomir|diarrhee/i,
      /dangereux|danger|produit\s+dangereux/i,
      /allergie|allergique/i,
      /commande\s+(?:incorrecte|fausse|mauvaise)/i,
      /reclamation|plainte/i,
    ].some((pattern) => pattern.test(normalized));
  }

  private detectIntent(message: string): AiIntent {
    return this.customerIntentService.detectIntent(message);
  }

  private resolveAllowedCategories(intent: CustomerIntent): string[] {
    const categories = this.customerIntentService.getCompatibleCategories(intent);

    if (categories.length > 0) {
      return categories;
    }

    return this.customerIntentService.getCompatibleCategories('ASK_SERVICES');
  }

  private extractRequestedProductService(message: string): string | null {
    const normalized = message.trim();
    const patterns = [
      /\b(?:article|produit|service)\s+(?:est\s+)?([a-z0-9][\w\s\-']{1,80})/i,
      /\b(?:je veux|je voudrais|j'ai besoin de|besoin de|want|need)\s+([a-z0-9][\w\s\-']{1,80})/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      const value = match?.[1]?.trim().replace(/[?.!,;:]+$/, '');

      if (value) {
        return value.slice(0, 120);
      }
    }

    return null;
  }

  private extractRequestedDeliveryDate(message: string): string | null {
    const normalized = message.trim();
    const numericDate = normalized.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/);

    if (numericDate?.[0]) {
      return numericDate[0];
    }

    const namedDate = normalized.match(
      /\b(?:aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\s+(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre))\b/i,
    );

    return namedDate?.[0] ?? null;
  }

  private stringifyAiDecision(response: AiReplyResponseDto): string {
    return JSON.stringify({
      action: response.action,
      reason: response.reason,
      confidence: response.confidence,
      handoffRequired: response.handoffRequired,
      sources: response.sources,
    });
  }

  private parseAgentJson(rawText: string): AgentJsonOutput | null {
    try {
      const parsed = JSON.parse(this.normalizeJsonText(rawText)) as unknown;

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      return parsed as AgentJsonOutput;
    } catch {
      return null;
    }
  }

  private extractAnswerFromJsonLikeText(rawText: string): string | null {
    const normalized = this.normalizeJsonText(rawText);

    if (!/"answer"\s*:/.test(normalized)) {
      return null;
    }

    const match = normalized.match(
      /"(?:reply|answer|replyText)"\s*:\s*"((?:\\.|[^"\\])*)"/s,
    );
    const partialMatch = normalized.match(
      /"(?:reply|answer|replyText)"\s*:\s*"((?:\\.|[^"\\])*)/s,
    );
    const encodedAnswer = match?.[1] ?? partialMatch?.[1];

    if (!encodedAnswer) {
      return null;
    }

    try {
      const answer = JSON.parse(`"${encodedAnswer}"`) as unknown;
      return typeof answer === 'string' && answer.trim()
        ? answer.trim()
        : null;
    } catch {
      const answer = encodedAnswer
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .trim();

      return answer || null;
    }
  }

  private isJsonLikeText(rawText: string): boolean {
    const trimmed = rawText.trim();

    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  private normalizeJsonText(rawText: string): string {
    const trimmed = rawText.trim();
    const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    return trimmed;
  }

  private normalizeIntent(intent?: string): AiIntent {
    const rawValue = intent?.trim();
    const upperValue = rawValue?.toUpperCase();
    const newIntents: CustomerIntent[] = [
      'ASK_MENU',
      'ASK_SERVICES',
      'ASK_DISH_AVAILABILITY',
      'ASK_PRICE',
      'ASK_DELIVERY',
      'ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS',
      'ASK_PAYMENT',
      'ASK_ORDER',
      'ASK_CONTACT',
      'FOOD_COMPLAINT',
      'GREETING',
      'CUSTOMER_DONE',
      'UNKNOWN',
    ];

    if (newIntents.includes(upperValue as CustomerIntent)) {
      return upperValue as CustomerIntent;
    }

    const value = rawValue?.toLowerCase();
    const workflowMap: Record<string, CustomerIntent | AiIntent> = {
      SERVICES_QUERY: 'ASK_SERVICES',
      PRICE_QUERY: 'ASK_PRICE',
      DELIVERY_QUERY: 'ASK_DELIVERY',
      DELIVERY_OR_PRODUCT_AMBIGUOUS_QUERY:
        'ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS',
      PAYMENT_QUERY: 'ASK_PAYMENT',
      PRODUCT_AVAILABILITY_QUERY: 'ASK_DISH_AVAILABILITY',
      ORDER_REQUEST: 'ASK_ORDER',
      ORDER_DETAILS_RECEIVED: 'ORDER_DETAILS_RECEIVED',
      THANK_YOU: 'CUSTOMER_DONE',
      UNKNOWN_QUERY: 'UNKNOWN',
      HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED',
    };

    if (upperValue && workflowMap[upperValue]) {
      return workflowMap[upperValue];
    }

    const allowed: AiIntent[] = [
      'pricing',
      'refund',
      'technical_support',
      'order_status',
      'complaint',
      'greeting',
      'other',
      'unknown',
    ];

    if (!allowed.includes(value as AiIntent)) {
      return 'UNKNOWN';
    }

    const legacyMap: Partial<Record<AiIntent, CustomerIntent>> = {
      pricing: 'ASK_PRICE',
      order_status: 'ASK_ORDER',
      complaint: 'FOOD_COMPLAINT',
      greeting: 'GREETING',
      other: 'UNKNOWN',
      unknown: 'UNKNOWN',
    };

    return legacyMap[value as AiIntent] ?? (value as AiIntent);
  }

  private normalizeConfidence(
    aiConfidence: number | undefined,
    ragConfidence: number,
  ): number {
    const parsed =
      typeof aiConfidence === 'number' && Number.isFinite(aiConfidence)
        ? aiConfidence
        : ragConfidence;

    return Number(Math.max(0, Math.min(1, parsed)).toFixed(2));
  }

  private keepAllowedSources(sources: string[], allowed: string[]) {
    const allowedSet = new Set(allowed);
    return sources.filter((source) => allowedSet.has(source));
  }

  private normalizeTags(
    tags: string[] | undefined,
    options: { addHandoff: boolean },
  ) {
    const normalized = (tags ?? [])
      .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_'))
      .filter(Boolean)
      .slice(0, 8);

    if (options.addHandoff && !normalized.includes('handoff')) {
      normalized.push('handoff');
    }

    return Array.from(new Set(normalized));
  }

  private resolveHandoffReason(params: {
    parsedHandoffRequired: boolean;
    escalationShouldHandoff: boolean;
    hallucinationValid: boolean;
    confidence: number;
    hasAnswer: boolean;
  }): string | null {
    if (!params.hallucinationValid) {
      return 'invalid_or_unsafe_ai_reply';
    }

    if (params.escalationShouldHandoff) {
      return 'unsafe_or_sensitive_message';
    }

    if (!params.hasAnswer) {
      return params.parsedHandoffRequired
        ? 'requires_human_review'
        : 'empty_ai_answer';
    }

    if (params.confidence < 0.45) {
      return 'low_ai_confidence';
    }

    if (params.parsedHandoffRequired) {
      return 'requires_human_review';
    }

    return null;
  }

  private resolveAction(params: {
    handoffRequired: boolean;
    needsClarification: boolean;
  }) {
    if (params.handoffRequired) return 'handoff';
    if (params.needsClarification) return 'clarify';
    return 'reply_ready';
  }

  private resolveUsage(
    usage: UsageSnapshot | undefined,
    prompt: string,
    answer: string,
  ): UsageSnapshot {
    if (usage?.totalTokens) {
      return usage;
    }

    const promptTokens = this.estimateTokens(prompt);
    const completionTokens = this.estimateTokens(answer);

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  private estimateTokens(text: string): number {
    return Math.max(1, Math.ceil((text ?? '').length / 4));
  }

  private findLatestInboundMessageId(conversation: ConversationContext | null) {
    return conversation?.messages.find(
      (message) => message.direction === 'inbound',
    )?.id;
  }

  private optionalRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }
}
