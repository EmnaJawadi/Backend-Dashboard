import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  buildEvolutionInstanceLookupCandidates,
  findMatchingEvolutionInstance,
} from '../../common/utils/evolution-instance.util';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AiRunsRepository } from '../ai-runs/ai-runs.repository';
import { RagResultDto } from '../rag/dto/rag-result.dto';
import { RagService } from '../rag/rag.service';
import { ProductVisionService } from '../products/product-vision.service';
import { CompanyAiPolicyService } from './company-ai-policy.service';
import { AiReplyRequestDto } from './dto/ai-reply-request.dto';
import { AiReplyResponseDto } from './dto/ai-reply-response.dto';
import { StructuredOutputDto } from './dto/structured-output.dto';
import {
  AiProviderAttempt,
  AiProviderGenerationError,
  AiProviderService,
} from './providers/ai-provider.service';
import {
  buildWorkflowGroundedReplyPrompt,
  buildWorkflowUnderstandingPrompt,
  WORKFLOW_SYSTEM_PROMPT,
} from './prompts/workflow.prompt';
import { buildSummarizerPrompt } from './prompts/summarizer.prompt';

type WorkflowOrderItem = {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  currency: string | null;
  subtotal: number | null;
  availability: string | null;
};

type WorkflowOrderDetails = {
  actionType: string | null;
  customerName: string | null;
  requestedItem: string | null;
  quantity: string | null;
  requestedDate: string | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
  items: WorkflowOrderItem[];
  total: number | null;
  currency: string | null;
  availability: string | null;
  confirmationStatus: string | null;
  missingFields: string[];
  // Hotel / accommodation specific fields
  checkInDate: string | null;
  checkOutDate: string | null;
  nights: number | null;
  numberOfAdults: number | null;
  numberOfChildren: number | null;
  childrenAges: string | null;
  roomType: string | null;
  boardFormula: string | null;
  numberOfRooms: number | null;
  selectedChoice: string | null;
};

type WorkflowAiDecision = {
  normalizedMessage: string;
  detectedLanguage: string;
  intent: string;
  needsRag: boolean;
  canAnswer: boolean;
  handoffRequired: boolean;
  orderIntent: boolean;
  orderDetails: WorkflowOrderDetails;
  replyDraft: string;
  reply: string;
  keywordsForSearch: string[];
  sources: string[];
  confidence: number;
  reason: string | null;
};

type ConversationContext = {
  id: string;
  companyId: string | null;
  contactId: string;
  assignedTo: string | null;
  status: string | null;
  botPaused: boolean | null;
  handoffRequired: boolean | null;
  lastCustomerMessageAt: Date | null;
  lastAiDecision: string | null;
  conversationSummary: string | null;
  messages: Array<{
    direction: string | null;
    content: string | null;
  }>;
};

type Usage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

type WorkflowDecisionGeneration = {
  decision: WorkflowAiDecision | null;
  rawText?: string;
  usage?: Usage;
  error?: unknown;
  provider?: string;
  model?: string;
  fallbackUsed: boolean;
  errorMessage?: string;
  attempts: AiProviderAttempt[];
  rawResponse?: Record<string, unknown>;
};

type WorkflowProviderResponses = {
  understanding?: WorkflowDecisionGeneration;
  grounded?: WorkflowDecisionGeneration;
};

type WorkflowResponseOutput = {
  source: 'KB' | 'LLM' | 'GEMINI' | 'FALLBACK';
  provider: string;
  model: string;
  responseMode?: AiReplyResponseDto['responseMode'];
  fallbackUsed?: boolean;
  errorMessage?: string;
};

@Injectable()
export class WorkflowAiService {
  private readonly logger = new Logger(WorkflowAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProviderService: AiProviderService,
    private readonly ragService: RagService,
    private readonly aiRunsRepository: AiRunsRepository,
    private readonly productVisionService?: ProductVisionService,
    private readonly companyAiPolicyService?: CompanyAiPolicyService,
  ) {}

  async generateReply(
    payload: AiReplyRequestDto,
    actor?: AuthenticatedUser,
    options?: { enforceWorkflowPayload?: boolean },
  ): Promise<AiReplyResponseDto> {
    const startedAt = Date.now();
    let message = (payload.message ?? payload.messageText ?? '').trim();
    const validation = this.validatePayload(payload, message);

    if (options?.enforceWorkflowPayload && validation.length) {
      return this.persistResponse({
        payload,
        response: this.buildNoReplyResponse(
          message,
          'invalid_workflow_payload',
          validation,
        ),
        startedAt,
      });
    }

    const conversation = payload.conversationId
      ? await this.getConversation(payload.conversationId)
      : null;
    const companyId = await this.resolveCompanyId(
      payload,
      conversation,
      actor,
      options?.enforceWorkflowPayload === true,
    );

    if (
      !companyId ||
      !conversation ||
      conversation.companyId !== companyId ||
      (payload.contactId && conversation.contactId !== payload.contactId)
    ) {
      return this.persistResponse({
        payload,
        response: this.buildNoReplyResponse(message, 'company_scope_mismatch'),
        startedAt,
      });
    }

    if (
      payload.messageId &&
      !(await this.isMessageInScope(payload.messageId, conversation.id, companyId))
    ) {
      return this.buildNoReplyResponse(message, 'message_scope_mismatch');
    }

    payload.companyId = companyId;
    payload.contactId = conversation.contactId;

    if (this.isHumanTakeoverActive(conversation)) {
      this.logger.log(
        `AI_REPLY_BLOCKED conversationId=${conversation.id} companyId=${companyId} reason=human_handoff_active`,
      );
      return this.persistResponse({
        payload,
        response: this.buildNoReplyResponse(
          message,
          'human_handoff_active',
          [],
          true,
        ),
        startedAt,
        companyId,
        conversation,
      });
    }

    let usedVision = false;
    if (
      payload.direction !== 'outbound' &&
      payload.fromMe !== true &&
      payload.hasMedia === true
    ) {
      const mediaType = (payload.mediaType || payload.messageType || '').toLowerCase();

      if (mediaType === 'image') {
        if (!this.productVisionService) {
          if (!message) {
            return this.persistResponse({
              payload,
              response: this.buildMediaClarificationResponse(
                'image',
                'Pouvez-vous ajouter une courte description de cette image et préciser votre demande ?',
              ),
              startedAt,
              companyId,
              conversation,
            });
          }
        } else {
        usedVision = true;
        const vision = await this.productVisionService.analyzeAndMatch({
          companyId,
          caption: payload.caption ?? message,
          mediaUrl: payload.mediaUrl,
          mediaId: payload.mediaId,
          rawPayload: payload.rawPayload,
        });

        if (vision.reliable && vision.match) {
          const caption = (payload.caption ?? message).trim();
          message = caption
            ? `${caption}\n\nProduit identifie dans le catalogue: ${vision.match.product.name}`
            : `Je souhaite des informations sur le produit ${vision.match.product.name}.`;
        } else if (!message) {
          return this.persistResponse({
            payload,
            response: this.buildMediaClarificationResponse(
              'image',
              'Je ne peux pas identifier ce produit avec assez de certitude. Pouvez-vous préciser son nom ou ce que vous souhaitez savoir ?',
              true,
            ),
            startedAt,
            companyId,
            conversation,
          });
        }
        }
      } else if (!message) {
        const reply =
          mediaType === 'audio'
            ? 'Je ne peux pas encore transcrire ce message audio de manière fiable. Pouvez-vous écrire votre demande en quelques mots ?'
            : 'Je ne peux pas exploiter cette pièce jointe seule de manière fiable. Pouvez-vous ajouter une courte description de votre demande ?';

        return this.persistResponse({
          payload,
          response: this.buildMediaClarificationResponse(mediaType || 'media', reply),
          startedAt,
          companyId,
          conversation,
        });
      }
    }

    if (
      payload.fromMe === true ||
      (payload.direction && payload.direction !== 'inbound') ||
      !message
    ) {
      return this.persistResponse({
        payload,
        response: this.buildNoReplyResponse(message, 'ignored_non_inbound_message', [], false),
        startedAt,
        companyId,
        conversation,
      });
    }

    const companyName = await this.getCompanyName(companyId);
    const history = this.buildHistory(payload, conversation);
    const previousOrderDetails = this.getPreviousOrderDetails(conversation);

    // Pre-LLM: detect strong frustration / explicit human-agent request
    const frustrationSignal = this.detectCustomerFrustration(message, history);
    if (frustrationSignal) {
      this.logger.warn(
        `AI_HANDOFF_FRUSTRATION companyId=${companyId} conversationId=${conversation.id} reason=${frustrationSignal.reason} language=${frustrationSignal.language}`,
      );
      const reply = this.handoffTransferReply(frustrationSignal.language);
      return this.persistResponse({
        payload,
        response: this.buildFrustrationHandoffResponse(message, frustrationSignal.reason, reply),
        startedAt,
        companyId,
        conversation,
      });
    }

    const analysisPrompt = buildWorkflowUnderstandingPrompt({
      message,
      companyName,
      history,
      previousOrderDetails: previousOrderDetails as unknown as Record<string, unknown> | null,
    });

    let analysis: WorkflowAiDecision;
    let analysisUsage: Usage | undefined;
    const providerResponses: WorkflowProviderResponses = {};
    const analysisResult = await this.generateDecisionWithRetry({
      phase: 'understanding',
      prompt: analysisPrompt,
      fallbackMessage: message,
      maxOutputTokens: 2000,
      companyId,
      instanceName: payload.instanceName ?? payload.instance,
    });
    providerResponses.understanding = analysisResult;
    analysisUsage = analysisResult.usage;

    if (!analysisResult.decision) {
      this.logger.warn(
        `Workflow understanding failed: ${this.errorMessage(analysisResult.error)}`,
      );

      return this.persistResponse({
        payload,
        response: this.buildTechnicalFailureResponse(
          message,
          'ai_provider_understanding_failed',
          analysisResult,
          undefined,
          this.detectFallbackLanguageFromHistory(message, history),
        ),
        startedAt,
        companyId,
        conversation,
        usage: analysisUsage,
        providerResponses,
      });
    }
    analysis = this.applyBusinessAndOrderGuards(
      analysisResult.decision,
      message,
      previousOrderDetails,
    );

    let decision = analysis;
    let rag: RagResultDto | null = null;
    let completionUsage = analysisUsage;
    let responseOutputOverride: WorkflowResponseOutput | undefined;

    if (analysis.needsRag) {
      this.logger.log(
        `AI_RAG_QUERY companyId=${companyId} companyName=${companyName ?? 'unknown'} conversationId=${conversation.id} messageId=${payload.messageId ?? 'null'} intent=${analysis.intent}`,
      );
      rag = await this.ragService.query({
        query: this.buildSearchQuery(message, analysis),
        history,
        companyId,
        intent: analysis.intent || 'BUSINESS_QUERY',
      });

      if (!rag.hasReliableSources) {
        this.logger.warn(
          `AI_RAG_NO_COMPANY_KB_SOURCE companyId=${companyId} conversationId=${conversation.id} messageId=${payload.messageId ?? 'null'} autoReplyBlocked=true`,
        );
        decision = this.buildMissingKnowledgeDecision(analysis);
      } else {
        this.logger.log(
          `AI_RAG_KB_USED companyId=${companyId} articleIds=${rag.sourceArticleIds.join(',') || 'none'} chunkIds=${rag.sourceChunkIds.join(',') || 'none'}`,
        );
        const groundedPrompt = buildWorkflowGroundedReplyPrompt({
          message,
          companyName,
          history,
          previousOrderDetails:
            previousOrderDetails as unknown as Record<string, unknown> | null,
          analysis: analysis as unknown as Record<string, unknown>,
          evidence: this.buildEvidenceContext(rag),
          allowedSources: rag.evidences
            .slice(0, 8)
            .map((evidence) => String(evidence.id)),
        });

        const groundedResult = await this.generateDecisionWithRetry({
          phase: 'grounded_reply',
          prompt: groundedPrompt,
          fallbackMessage: analysis.normalizedMessage || message,
          maxOutputTokens: 2600,
          companyId,
          instanceName: payload.instanceName ?? payload.instance,
          language: analysis.detectedLanguage,
        });
        providerResponses.grounded = groundedResult;
        completionUsage = this.combineUsage(analysisUsage, groundedResult.usage);

        if (groundedResult.decision) {
          decision = this.mergeGroundedDecision(
            analysis,
            groundedResult.decision,
            rag,
          );

          if (!decision.canAnswer || !decision.sources.length) {
            this.logger.warn(
              `AI_RAG_LLM_UNGROUNDED companyId=${companyId} conversationId=${conversation.id} messageId=${payload.messageId ?? 'null'} fallbackToEvidence=true`,
            );
            decision = this.buildRagEvidenceFallbackDecision(
              analysis,
              rag,
              'rag_evidence_fallback_after_ungrounded_llm_reply',
            );
            responseOutputOverride = this.ragEvidenceFallbackOutput(groundedResult);
          }
        } else {
          this.logger.warn(
            `Workflow grounded reply failed: ${this.errorMessage(groundedResult.error)}; using reliable RAG evidence fallback.`,
          );
          decision = this.buildRagEvidenceFallbackDecision(
            analysis,
            rag,
            'rag_evidence_fallback_after_grounded_failure',
          );
          responseOutputOverride = this.ragEvidenceFallbackOutput(groundedResult);
        }
      }
    }

    const businessDomain = this.companyAiPolicyService
      ? await this.companyAiPolicyService.resolveBusinessDomain(
          companyId,
          rag?.hasReliableSources
            ? rag.evidences.map((evidence) => evidence.content)
            : [],
        )
      : 'generic';

    if (businessDomain === 'hospitality') {
      decision = this.ensureHospitalityBookingGuidance(decision, message, rag);
    }
    decision = this.applyFinalKnowledgeGuards(decision, message, rag);
    if (businessDomain === 'hospitality') {
      decision = this.applyGroundedHotelPricing(decision, message, rag);
    }

    const orderActionPrepared = decision.orderIntent
      ? await this.prepareCustomerRequest(decision, companyId, conversation)
      : false;
    const response = this.buildResponse(
      decision,
      payload,
      companyId,
      conversation,
      rag,
      orderActionPrepared,
      responseOutputOverride ??
        this.responseProviderOutput(
          providerResponses.grounded ?? providerResponses.understanding,
        ),
      usedVision,
    );
    return this.persistResponse({
      payload,
      response,
      startedAt,
      companyId,
      conversation,
      rag,
      usage: completionUsage,
      providerResponses,
    });
  }

  async summarizeConversation(
    history: Array<{ role: string; content: string }>,
  ): Promise<string | null> {
    if (!history.length) {
      return null;
    }

    const result = await this.aiProviderService.generateAnswer({
      userMessage: buildSummarizerPrompt(history),
      systemPrompt: WORKFLOW_SYSTEM_PROMPT,
      temperature: 0.1,
      maxOutputTokens: 180,
    });

    return result.text || null;
  }

  async generateStructuredOutput<T = Record<string, unknown>>(
    prompt: string,
  ): Promise<StructuredOutputDto<T>> {
    const result = await this.aiProviderService.generateAnswer({
      userMessage: prompt,
      systemPrompt: 'Return strict JSON only.',
      temperature: 0.1,
      maxOutputTokens: 400,
      responseMimeType: 'application/json',
    });

    try {
      return new StructuredOutputDto<T>({
        success: true,
        data: JSON.parse(this.unwrapJson(result.text)) as T,
        rawText: result.text,
        error: null,
      });
    } catch {
      return new StructuredOutputDto<T>({
        success: false,
        data: null,
        rawText: result.text,
        error: 'Invalid JSON returned by AI provider.',
      });
    }
  }

  private validatePayload(payload: AiReplyRequestDto, message: string): string[] {
    const missing: string[] = [];

    if (!payload.companyId?.trim()) missing.push('companyId');
    if (!payload.conversationId?.trim()) missing.push('conversationId');
    if (!payload.contactId?.trim()) missing.push('contactId');
    if (!payload.messageId?.trim()) missing.push('messageId');
    if (!payload.phoneNumber?.trim()) missing.push('phoneNumber');
    if (!(payload.instanceName ?? payload.instance)?.trim()) missing.push('instanceName');
    if (!payload.messageType?.trim()) missing.push('messageType');
    if (typeof payload.hasMedia !== 'boolean') missing.push('hasMedia');
    if (!payload.rawPayload || typeof payload.rawPayload !== 'object') missing.push('rawPayload');
    if (!message && payload.hasMedia !== true) missing.push('message');

    return missing;
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
          include: {
            company: {
              select: {
                id: true,
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
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return findMatchingEvolutionInstance(instances, instanceName);
  }

  private async resolveCompanyId(
    payload: AiReplyRequestDto,
    conversation: ConversationContext | null,
    actor?: AuthenticatedUser,
    enforceMappedInstance = false,
  ): Promise<string | null> {
    const actorCompanyId = resolveCompanyScope(actor);
    const requestedCompanyId = payload.companyId?.trim() || null;
    const conversationCompanyId = conversation?.companyId?.trim() || null;
    const instanceName = (payload.instanceName ?? payload.instance)?.trim() || null;
    const instance = instanceName
      ? await this.findWhatsappInstanceByName(instanceName)
      : null;
    const instanceCompanyId = instance?.companyId?.trim() || null;
    const requireMappedInstance = enforceMappedInstance || !actor;
    const scopedIds = [actorCompanyId, requestedCompanyId, instanceCompanyId]
      .filter((value): value is string => Boolean(value));

    if (
      !conversationCompanyId ||
      (requireMappedInstance && !instanceCompanyId) ||
      scopedIds.some((id) => id !== conversationCompanyId)
    ) {
      this.logger.warn(
        `AI_COMPANY_SCOPE_REJECTED instanceName=${instanceName ?? 'null'} requestedCompanyId=${requestedCompanyId ?? 'null'} actorCompanyId=${actorCompanyId ?? 'null'} conversationCompanyId=${conversationCompanyId ?? 'null'} mappedCompanyId=${instanceCompanyId ?? 'null'} replyBlocked=true`,
      );
      return null;
    }

    this.logger.log(
      `AI_COMPANY_DETECTED companyId=${conversationCompanyId} companyName=${instance?.company?.name ?? 'unknown'} instanceName=${instanceName ?? 'null'} mappedInstance=${instance?.evolutionInstanceName ?? 'null'} conversationId=${conversation?.id ?? 'null'}`,
    );

    return conversationCompanyId;
  }

  private async isMessageInScope(
    messageId: string,
    conversationId: string,
    companyId: string,
  ): Promise<boolean> {
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        companyId,
      },
      select: { id: true },
    });

    return Boolean(message);
  }

  private async getConversation(id: string): Promise<ConversationContext | null> {
    return this.prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        contactId: true,
        assignedTo: true,
        status: true,
        botPaused: true,
        handoffRequired: true,
        lastCustomerMessageAt: true,
        lastAiDecision: true,
        conversationSummary: true,
        messages: {
          select: { direction: true, content: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
  }

  private isHumanTakeoverActive(conversation: ConversationContext): boolean {
    return (
      conversation.handoffRequired === true ||
      conversation.botPaused === true ||
      conversation.status === 'human_assigned' ||
      Boolean(conversation.assignedTo)
    );
  }

  private async getCompanyName(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    return company?.name?.trim() || null;
  }

  private buildHistory(
    payload: AiReplyRequestDto,
    conversation: ConversationContext,
  ): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    if (payload.history?.length) {
      return payload.history.slice(-50).map((item) => ({
        role: item.role,
        content: item.content,
      }));
    }

    const messages = conversation.messages
      .slice()
      .reverse()
      .filter((item) => Boolean(item.content?.trim()))
      .map((item) => ({
        role: (item.direction === 'inbound' ? 'user' : 'assistant') as
          | 'user'
          | 'assistant',
        content: item.content?.trim() ?? '',
      }));
    return conversation.conversationSummary?.trim()
      ? [
          {
            role: 'system' as const,
            content: `Conversation summary: ${conversation.conversationSummary.trim()}`,
          },
          ...messages,
        ]
      : messages;
  }

  private getPreviousOrderDetails(
    conversation: ConversationContext,
  ): WorkflowOrderDetails | null {
    if (!conversation.lastAiDecision?.trim()) {
      return null;
    }

    try {
      const saved = JSON.parse(conversation.lastAiDecision) as Record<string, unknown>;

      return saved.orderIntent === true
        ? this.parseOrderDetails(saved.orderDetails)
        : null;
    } catch {
      return null;
    }
  }

  private applyBusinessAndOrderGuards(
    decision: WorkflowAiDecision,
    message: string,
    previousOrderDetails: WorkflowOrderDetails | null,
  ): WorkflowAiDecision {
    if (this.isPureSocialMessage(message)) {
      const reply = this.socialReply(decision.detectedLanguage, message);
      return {
        ...decision,
        needsRag: false,
        canAnswer: true,
        handoffRequired: false,
        orderIntent: false,
        orderDetails: previousOrderDetails ?? this.emptyOrderDetails(),
        replyDraft: reply,
        reply,
        sources: [],
        reason: null,
      };
    }

    const reusablePreviousOrderDetails =
      previousOrderDetails &&
      decision.orderDetails.actionType &&
      previousOrderDetails.actionType &&
      decision.orderDetails.actionType !== previousOrderDetails.actionType
        ? null
        : previousOrderDetails;
    const continuesOrder =
      decision.orderIntent ||
      Boolean(
        reusablePreviousOrderDetails &&
          (this.isOrderContinuation(message) ||
            this.isOrderContinuation(decision.normalizedMessage)),
      );
    const accumulatedOrderDetails = continuesOrder
      ? this.mergeOrderDetails(
          reusablePreviousOrderDetails ?? this.emptyOrderDetails(),
          decision.orderDetails,
        )
      : decision.orderDetails;
    const correctedOrderDetails = continuesOrder
      ? this.applyExplicitCorrections(
          accumulatedOrderDetails,
          reusablePreviousOrderDetails,
          message,
          decision.intent,
        )
      : decision.orderDetails;
    const orderDetails = continuesOrder
      ? this.finalizeOrderDetails(
          this.retainPreviouslyGroundedFacts(
            correctedOrderDetails,
            reusablePreviousOrderDetails,
          ),
        )
      : correctedOrderDetails;

    return {
      ...decision,
      needsRag:
        decision.needsRag ||
        continuesOrder ||
        this.requiresCompanyKnowledge(message, decision.intent),
      orderIntent: continuesOrder,
      orderDetails,
    };
  }

  private retainPreviouslyGroundedFacts(
    details: WorkflowOrderDetails,
    previous: WorkflowOrderDetails | null,
  ): WorkflowOrderDetails {
    const hotelPricingChanged = Boolean(
      previous &&
        [
          'checkInDate',
          'checkOutDate',
          'numberOfAdults',
          'numberOfChildren',
          'childrenAges',
          'roomType',
          'boardFormula',
          'numberOfRooms',
        ].some(
          (field) =>
            details[field as keyof WorkflowOrderDetails] !==
            previous[field as keyof WorkflowOrderDetails],
        ),
    );
    const previousItems = new Map(
      (previous?.items ?? []).map((item) => [
        this.normalizeSearchText(item.name),
        item,
      ]),
    );

    return {
      ...details,
      items: details.items.map((item) => {
        const prior = previousItems.get(this.normalizeSearchText(item.name));

        return {
          ...item,
          unitPrice: hotelPricingChanged ? null : (prior?.unitPrice ?? null),
          currency: hotelPricingChanged
            ? null
            : (prior?.currency ?? previous?.currency ?? null),
          subtotal: hotelPricingChanged ? null : (prior?.subtotal ?? null),
          availability: hotelPricingChanged ? null : (prior?.availability ?? null),
        };
      }),
      total: hotelPricingChanged ? null : (previous?.total ?? null),
      currency: hotelPricingChanged ? null : (previous?.currency ?? null),
      availability: hotelPricingChanged ? null : (previous?.availability ?? null),
      confirmationStatus: previous?.confirmationStatus ?? details.confirmationStatus,
      // Retain hotel booking details from previous turn
      checkInDate: details.checkInDate ?? previous?.checkInDate ?? null,
      checkOutDate: details.checkOutDate ?? previous?.checkOutDate ?? null,
      nights: details.nights ?? previous?.nights ?? null,
      numberOfAdults: details.numberOfAdults ?? previous?.numberOfAdults ?? null,
      numberOfChildren: details.numberOfChildren ?? previous?.numberOfChildren ?? null,
      childrenAges: details.childrenAges ?? previous?.childrenAges ?? null,
      roomType: details.roomType ?? previous?.roomType ?? null,
      boardFormula: details.boardFormula ?? previous?.boardFormula ?? null,
      numberOfRooms: details.numberOfRooms ?? previous?.numberOfRooms ?? null,
      selectedChoice: details.selectedChoice ?? previous?.selectedChoice ?? null,
    };
  }

  private applyExplicitCorrections(
    details: WorkflowOrderDetails,
    previous: WorkflowOrderDetails | null,
    message: string,
    intent: string,
  ): WorkflowOrderDetails {
    const normalized = this.normalizeSearchText(`${message} ${intent}`);
    if (/\b(annule ca|annuler ca|cancel this request|cancel request)\b/.test(normalized)) {
      return this.emptyOrderDetails();
    }

    const corrected = { ...details };
    const correctionSignal =
      /\b(non|faux|incorrect|wrong|ghaltet|plutot|finalement|changer|correction|pas)\b/.test(
        normalized,
      ) || /CORRECTION|CHOICE_CHANGE/.test(intent.toUpperCase());
    if (!correctionSignal) {
      return corrected;
    }

    const phoneMatch = message.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
    if (/\b(numero|telephone|phone)\b/.test(normalized)) {
      corrected.phone = phoneMatch?.[0].replace(/[^+\d]/g, '') ?? null;
    }

    if (/\bsenior suite\b/.test(normalized)) corrected.roomType = 'Senior Suite';
    if (/\bjunior suite\b/.test(normalized)) corrected.roomType = 'Junior Suite';

    const adults = normalized.match(/\b(\d+)\s+adultes?\b/);
    if (adults) corrected.numberOfAdults = Number(adults[1]);
    const children = normalized.match(/\b(\d+)\s+enfants?\b/);
    if (children) corrected.numberOfChildren = Number(children[1]);
    if (/\b(pas d enfants|aucun enfant|sans enfant)\b/.test(normalized)) {
      corrected.numberOfChildren = 0;
      corrected.childrenAges = null;
    }

    const formula = normalized.match(/\bp([1-5])\b/);
    if (formula) corrected.boardFormula = formula[0].toUpperCase();

    const pricingChanged = Boolean(
      previous &&
        [
          corrected.checkInDate !== previous.checkInDate,
          corrected.checkOutDate !== previous.checkOutDate,
          corrected.numberOfAdults !== previous.numberOfAdults,
          corrected.numberOfChildren !== previous.numberOfChildren,
          corrected.childrenAges !== previous.childrenAges,
          corrected.roomType !== previous.roomType,
          corrected.boardFormula !== previous.boardFormula,
          corrected.numberOfRooms !== previous.numberOfRooms,
        ].some(Boolean),
    );
    return pricingChanged
      ? {
          ...corrected,
          items: [],
          total: null,
          currency: null,
          selectedChoice: corrected.roomType ?? corrected.selectedChoice,
        }
      : corrected;
  }

  private requiresCompanyKnowledge(message: string, intent: string): boolean {
    const normalized = this.normalizeSearchText(`${message} ${intent}`);

    return (
      /\b(menu|plat|plats|repas|produit|produits|article|articles|variant|variante|dish|boisson|boissons|drink|prix|tarif|cout|combien|price|cost|reservation|booking|chambre|room|suite|sejour|hotel|resort|disponib|stock|supplement|single|vue mer|reduction|enfant|minimum stay|sejour minimum|condition|conditions|service|services|formule|all inclusive|livraison|livrer|delivery|paiement|payment|commande|order|touslou|twasslou|ncommandi|9addech|9adech|soum|taklfa|nhajez)\b/.test(
        normalized,
      ) ||
      /(تكلفة|التكلفة|السعر|الحجز|حجز|نحجز|قداش|بيت|غرفة|اقامة|إقامة)/u.test(
        normalized,
      )
    );
  }

  private isPureSocialMessage(message: string): boolean {
    const normalized = this.normalizeSearchText(message);
    return (
      /^(?:aaslama|asslama|ahla|marhba|merhba|bonjour|bonsoir|salut|slt|hello|hi|hey|merci|merci beaucoup|bonne journee|au revoir|a bientot|de rien|d accord|daccord|ok|okay|tres bien|شكرا|مرحبا|اهلا)$/.test(
        normalized,
      ) ||
      /^(?:d accord )?(?:nous |on )?vous rappellerons(?: merci)?$/.test(normalized)
    );
  }

  private socialReply(language: string, message = ''): string {
    const normalized = language.toLowerCase();
    const normalizedMessage = this.normalizeSearchText(message);
    const isThanksOrEnding =
      /\b(merci|rappellerons|a bientot|au revoir|tres bien|d accord|daccord|ok|okay)\b/.test(
        normalizedMessage,
      );
    if (
      normalized === 'tunisian_arabic_latin' ||
      normalized.includes('arabizi') ||
      normalized.includes('tounsi_latin')
    ) {
      return isThanksOrEnding
        ? 'Behy, merci lik. Neb9aw aala dhimtek.'
        : 'Aaslama! Kifech najem n3awnek?';
    }
    if (
      normalized === 'tunisian_arabic' ||
      normalized === 'ar' ||
      normalized === 'arabic'
    ) {
      return isThanksOrEnding
        ? '\u0634\u0643\u0631\u0627 \u0644\u0643. \u0646\u0628\u0642\u0649 \u0639\u0644\u0649 \u0630\u0645\u062a\u0643.'
        : '\u0645\u0631\u062d\u0628\u0627! \u0643\u064a\u0641 \u064a\u0645\u0643\u0646\u0646\u064a \u0645\u0633\u0627\u0639\u062f\u062a\u0643\u061f';
    }
    if (normalized === 'en' || normalized.startsWith('en_')) {
      return isThanksOrEnding
        ? 'Thank you. We remain available if needed.'
        : 'Hello! How can I help?';
    }
    return isThanksOrEnding
      ? 'D\u2019accord, merci a vous. Nous restons a votre disposition.'
      : 'Bonjour ! Comment puis-je vous aider ?';
  }

  private isOrderContinuation(message: string): boolean {
    const normalized = this.normalizeSearchText(message);

    return (
      /^(oui|yes|ok|okay|daccord|je confirme|confirme|confirm|ey|eey|ihe|نعم|اي|إي)\b/.test(
        normalized,
      ) ||
      /\b(quantite|quantites|quantity|commande|commandi|confirmation|confirme)\b/.test(
        normalized,
      ) ||
      // Hotel booking detail provision: dates, guest counts, ages, room type
      /\b(arrivee|depart|checkin|checkout|adulte|adultes|enfant|enfants|chambre|nuit|nuits|personne|personnes|ans|age|type)\b/.test(
        normalized,
      ) ||
      /(الدخول|الخروج|كبار|الكبار|أطفال|اطفال|الأطفال|غرفة|ليلة|ليالي|اعمار|أعمار)/u.test(
        message,
      ) ||
      // Date patterns: "10 juillet", "15/07", "10-07-2026"
      /\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/.test(message) ||
      /\b\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/i.test(
        normalized,
      )
    );
  }

  private buildMissingKnowledgeDecision(
    analysis: WorkflowAiDecision,
  ): WorkflowAiDecision {
    return {
      ...analysis,
      canAnswer: false,
      handoffRequired: true,
      replyDraft: this.verificationReply(analysis.detectedLanguage),
      reply: this.verificationReply(analysis.detectedLanguage),
      sources: [],
      reason: 'missing_company_evidence',
      orderDetails: this.finalizeOrderDetails(analysis.orderDetails),
    };
  }

  private verificationReply(language: string): string {
    const normalized = language.toLowerCase();

    if (
      normalized === 'tunisian_arabic_latin' ||
      normalized.includes('arabizi') ||
      normalized.includes('tounsi_latin')
    ) {
      return "Ma 3andich l'information hedhi bedda9a taw. Najem nwassel talbek l responsable.";
    }

    if (
      normalized === 'tunisian_arabic' ||
      normalized === 'ar' ||
      normalized === 'arabic' ||
      normalized.includes('arabic_script')
    ) {
      return '\u0644\u064a\u0633 \u0644\u062f\u064a \u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0629 \u0627\u0644\u062f\u0642\u064a\u0642\u0629 \u062d\u0627\u0644\u064a\u0627. \u064a\u0645\u0643\u0646\u0646\u064a \u062a\u062d\u0648\u064a\u0644 \u0637\u0644\u0628\u0643 \u0625\u0644\u0649 \u0627\u0644\u0645\u0633\u0624\u0648\u0644.';
    }

    if (
      normalized === 'en' ||
      normalized.startsWith('en_') ||
      normalized.includes('english')
    ) {
      return "I don't have that exact information right now. I can forward your request to a manager.";
    }

    return "Je n'ai pas cette information exacte pour le moment. Je peux transmettre votre demande \u00e0 un responsable.";
  }

  private normalizeSearchText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  private buildSearchQuery(message: string, decision: WorkflowAiDecision): string {
    if (decision.orderIntent) {
      const actionType = (decision.orderDetails.actionType ?? '').toLowerCase();
      const isReservation = actionType === 'reservation' || actionType === 'booking';
      const roomTypeHint = decision.orderDetails.roomType
        ? `chambre ${decision.orderDetails.roomType}`
        : null;

      return Array.from(
        new Set(
          [
            message,
            decision.normalizedMessage,
            decision.orderDetails.requestedItem,
            ...decision.orderDetails.items.map((item) => item.name),
            decision.orderDetails.actionType === 'order' &&
            decision.orderDetails.address
              ? `livraison ${decision.orderDetails.address}`
              : null,
            isReservation
              ? 'reservation booking chambre sejour hotel prix tarif cout تكلفة السعر الحجز نحجز قداش إقامة'
              : 'commande prix disponibilite confirmation',
            isReservation ? roomTypeHint : null,
            ...decision.keywordsForSearch.slice(0, 8),
          ].filter((value): value is string => Boolean(value)),
        ),
      ).join(' ');
    }

    return Array.from(
      new Set(
        [
          message,
          decision.normalizedMessage,
          ...decision.keywordsForSearch,
        ].filter((value): value is string => Boolean(value)),
      ),
    ).join(' ');
  }

  private ensureHospitalityBookingGuidance(
    decision: WorkflowAiDecision,
    message: string,
    rag: RagResultDto | null,
  ): WorkflowAiDecision {
    const evidence = this.normalizeSearchText(
      rag?.evidences.map((item) => item.content).join(' ') ?? '',
    );
    const request = this.normalizeSearchText(
      `${message} ${decision.normalizedMessage} ${decision.intent}`,
    );
    const isHotelEvidence =
      /\b(hotel|resort|chambre|room|suite|sejour|all inclusive|pax)\b/.test(
        evidence,
      );
    const hasReservationState =
      decision.orderIntent &&
      ['reservation', 'booking'].includes(
        (decision.orderDetails.actionType ?? '').toLowerCase(),
      );
    const isBookingRequest =
      hasReservationState ||
      /\b(reservation|booking|reserver|reserve|nhajez|sejour complet|total sejour|cout du sejour|stay total)\b/.test(
        request,
      ) ||
      /(الحجز|حجز|نحجز)/u.test(
        request,
      );

    if (
      decision.intent.toUpperCase() === 'STAY_DETAILS_QUERY' &&
      !this.isPriceRequest(request) &&
      !/\b(reservation|booking|reserver|reserve|nhajez)\b/.test(request)
    ) {
      return decision;
    }

    if (
      !isBookingRequest ||
      (!hasReservationState &&
        (!rag?.hasReliableSources || rag.evidences.length === 0 || !isHotelEvidence))
    ) {
      return decision;
    }

    const orderDetails = this.finalizeOrderDetails({
      ...this.emptyOrderDetails(),
      ...(decision.orderDetails ?? {}),
      actionType: decision.orderDetails?.actionType ?? 'reservation',
    });
    if (orderDetails.missingFields.length === 0) {
      return { ...decision, orderDetails };
    }

    const reply = this.hospitalityDetailsRequest(
      decision.detectedLanguage,
      orderDetails.missingFields,
    );

    return {
      ...decision,
      canAnswer: true,
      handoffRequired: false,
      orderDetails,
      replyDraft: reply,
      reply,
      reason:
        decision.reason === 'missing_company_evidence'
          ? 'hospitality_details_required'
          : decision.reason,
    };
  }

  private hospitalityDetailsRequest(
    language: string,
    missingFields: string[] = [],
  ): string {
    const normalized = language.toLowerCase();
    const missing = new Set(missingFields);
    const allMissing = missing.size === 0;
    const fieldKeys = [
      'checkInDate',
      'checkOutDate',
      'numberOfAdults',
      'numberOfChildren',
      'childrenAges',
      'roomType',
    ].filter((field) => allMissing || missing.has(field));
    const frenchLabels: Record<string, string> = {
      checkInDate: "la date d'arrivee",
      checkOutDate: 'la date de depart',
      numberOfAdults: "le nombre d'adultes",
      numberOfChildren: "le nombre d'enfants",
      childrenAges: "l'age de chaque enfant",
      roomType: 'le type de chambre',
    };
    const englishLabels: Record<string, string> = {
      checkInDate: 'the check-in date',
      checkOutDate: 'the check-out date',
      numberOfAdults: 'the number of adults',
      numberOfChildren: 'the number of children',
      childrenAges: "each child's age",
      roomType: 'the room type',
    };
    const requested = this.joinNaturalList(
      fieldKeys.map((field) => frenchLabels[field]),
    );

    if (
      normalized === 'tunisian_arabic_latin' ||
      normalized.includes('arabizi') ||
      normalized.includes('tounsi_latin')
    ) {
      return `Bech n7seblek ettaklfa bedda9a, na9sni: ${requested}.`;
    }

    if (
      normalized === 'tunisian_arabic' ||
      normalized === 'ar' ||
      normalized === 'arabic' ||
      normalized.includes('arabic_script')
    ) {
      return 'لحساب السعر بدقة، أرسل تاريخ الدخول والخروج، عدد الكبار، عدد الأطفال وأعمارهم، ونوع الغرفة.';
    }

    if (
      normalized === 'en' ||
      normalized.startsWith('en_') ||
      normalized.includes('english')
    ) {
      return `For an exact total, please provide: ${this.joinNaturalList(
        fieldKeys.map((field) => englishLabels[field]),
      )}.`;
    }

    return `Pour calculer le total exact, indiquez: ${requested}.`;
  }

  private buildEvidenceContext(rag: RagResultDto): string {
    return rag.evidences
      .slice(0, 8)
      .map((evidence) => {
        const id = String(evidence.id);
        return `[source:${id}]\n${evidence.content.trim().slice(0, 1200)}`;
      })
      .join('\n\n')
      .slice(0, 6000);
  }

  private buildRagEvidenceFallbackDecision(
    initial: WorkflowAiDecision,
    rag: RagResultDto,
    reason: string,
  ): WorkflowAiDecision {
    const relevantEvidences = this.relevantEvidencesForRequest(
      initial.normalizedMessage,
      rag,
    );
    const sources = relevantEvidences
      .slice(0, 8)
      .map((evidence) => String(evidence.id))
      .filter(Boolean);
    const reply = this.buildRagEvidenceFallbackReply(
      initial,
      rag,
    );
    const canAnswer = sources.length > 0 && reply.length > 0;

    return {
      ...initial,
      needsRag: true,
      canAnswer,
      handoffRequired: canAnswer ? initial.handoffRequired : true,
      orderDetails: this.finalizeOrderDetails(initial.orderDetails),
      replyDraft: canAnswer ? reply : this.verificationReply(initial.detectedLanguage),
      reply: canAnswer ? reply : this.verificationReply(initial.detectedLanguage),
      sources,
      confidence: Math.max(initial.confidence, rag.confidence),
      reason: canAnswer ? reason : 'rag_results_not_relevant',
    };
  }

  private buildRagEvidenceFallbackReply(
    initial: WorkflowAiDecision,
    rag: RagResultDto,
  ): string {
    const query = initial.normalizedMessage;
    const relevantEvidences = this.relevantEvidencesForRequest(query, rag);

    if (this.isPriceRequest(query)) {
      return this.buildPriceEvidenceReply(
        initial.detectedLanguage,
        relevantEvidences,
        query,
      );
    }

    if (this.isRoomTypeRequest(query)) {
      return this.buildRoomTypesReply(
        initial.detectedLanguage,
        relevantEvidences,
      );
    }

    const bullets = relevantEvidences
      .slice(0, 6)
      .map((evidence) => this.formatEvidenceBullet(evidence))
      .filter(Boolean);

    if (!bullets.length) {
      return '';
    }

    return bullets.length === 1
      ? bullets[0].replace(/^[-*]\s*/, '').slice(0, 1200)
      : bullets.join('\n').slice(0, 1200);
  }

  private formatEvidenceBullet(evidence: RagResultDto['evidences'][number]): string {
    const snippet = this.evidenceSnippet(
      this.contentWithoutArticleTitle(evidence),
    );
    return snippet ? `- ${snippet}` : '';
  }

  private evidenceSnippet(content: string, maxLength = 420): string {
    const compact = content
      .replace(/(^|\s)#{1,6}\s+/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim();

    if (!compact) {
      return '';
    }

    const sentences = compact
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const candidate =
      sentences.length > 1 ? sentences.slice(0, 2).join(' ') : compact;

    if (candidate.length <= maxLength) {
      return candidate;
    }

    const truncated = candidate.slice(0, maxLength).trim();
    const lastSpace = truncated.lastIndexOf(' ');

    return `${(lastSpace > 120 ? truncated.slice(0, lastSpace) : truncated).trim()}...`;
  }

  private applyFinalKnowledgeGuards(
    decision: WorkflowAiDecision,
    message: string,
    rag: RagResultDto | null,
  ): WorkflowAiDecision {
    if (!decision.needsRag || !rag) {
      return decision;
    }

    const query = `${message} ${decision.normalizedMessage} ${decision.intent}`;

    if (
      this.isAvailabilityDatesRequest(query) &&
      !this.hasAvailabilityCalendar(rag.evidences)
    ) {
      const reply = this.availabilityDatesClarification(
        decision.detectedLanguage,
      );

      return {
        ...decision,
        canAnswer: true,
        handoffRequired: false,
        replyDraft: reply,
        reply,
        sources: [],
        reason: 'availability_calendar_not_in_kb',
      };
    }

    const finalizedOrderDetails = this.finalizeOrderDetails(
      decision.orderDetails,
    );
    if (
      this.isPriceRequest(query) &&
      this.isStayTotalRequest(query) &&
      finalizedOrderDetails.missingFields.length > 0
    ) {
      const reply = this.hospitalityDetailsRequest(
        decision.detectedLanguage,
        finalizedOrderDetails.missingFields,
      );
      return {
        ...decision,
        canAnswer: true,
        handoffRequired: false,
        orderDetails: finalizedOrderDetails,
        replyDraft: reply,
        reply,
        sources: [],
        reason: 'hospitality_details_required',
      };
    }

    if (
      this.isPriceRequest(query) &&
      !this.hasPriceQueryConstraint(query) &&
      this.isGenericTariffRequest(query)
    ) {
      const reply = this.tariffSearchClarification(decision.detectedLanguage);
      return {
        ...decision,
        canAnswer: true,
        handoffRequired: false,
        replyDraft: reply,
        reply,
        sources: [],
        reason: 'tariff_details_required',
      };
    }

    const relevantEvidences = this.relevantEvidencesForRequest(query, rag);
    const isSpecificRequest =
      this.isPriceRequest(query) ||
      this.isRoomTypeRequest(query) ||
      this.hasKnownBusinessTopic(query);

    if (isSpecificRequest && relevantEvidences.length === 0) {
      return {
        ...this.buildMissingKnowledgeDecision(decision),
        reason: 'rag_results_not_relevant',
      };
    }

    const sources = this.stringArray(
      relevantEvidences.map((evidence) => String(evidence.id)),
    );
    const hasStayDetails = finalizedOrderDetails.missingFields.length === 0;

    if (this.isPriceRequest(query) && !hasStayDetails) {
      const reply = this.buildPriceEvidenceReply(
        decision.detectedLanguage,
        relevantEvidences,
        query,
      );
      if (reply) {
        return {
          ...decision,
          canAnswer: true,
          handoffRequired: false,
          replyDraft: reply,
          reply,
          sources,
          reason: 'grounded_price_evidence',
        };
      }
    }

    if (this.isRoomTypeRequest(query)) {
      const reply = this.buildRoomTypesReply(
        decision.detectedLanguage,
        relevantEvidences,
      );
      if (reply) {
        return {
          ...decision,
          canAnswer: true,
          handoffRequired: false,
          replyDraft: reply,
          reply,
          sources,
          reason: 'grounded_room_types',
        };
      }
    }

    const reply = this.cleanGroundedReply(decision.reply, rag);
    if (!reply && decision.canAnswer) {
      return this.buildRagEvidenceFallbackDecision(
        decision,
        rag,
        'rag_evidence_fallback_after_empty_reply',
      );
    }

    return {
      ...decision,
      replyDraft: reply || decision.replyDraft,
      reply: reply || decision.reply,
      sources: decision.sources.length ? this.stringArray(decision.sources) : sources,
    };
  }

  private applyGroundedHotelPricing(
    decision: WorkflowAiDecision,
    message: string,
    rag: RagResultDto | null,
  ): WorkflowAiDecision {
    if (!rag?.hasReliableSources || !this.isStayTotalRequest(`${message} ${decision.intent}`)) {
      return decision;
    }

    const details = this.finalizeOrderDetails(decision.orderDetails);
    if (
      !['reservation', 'booking'].includes((details.actionType ?? '').toLowerCase()) ||
      details.missingFields.length > 0 ||
      !details.nights ||
      !details.checkInDate ||
      !details.checkOutDate ||
      !details.roomType
    ) {
      return decision;
    }

    const checkInDate = details.checkInDate;
    const checkOutDate = details.checkOutDate;
    const requestedRoomType = details.roomType;

    const facts = this.extractHotelRateFacts(rag.evidences);
    const requestedRoom = this.normalizeSearchText(requestedRoomType);
    const roomFacts = facts.filter((fact) => {
      const room = this.normalizeSearchText(fact.roomType);
      return requestedRoom === 'suite'
        ? room.includes('suite')
        : room === requestedRoom || room.includes(requestedRoom);
    });
    const stayFacts = roomFacts.filter((fact) =>
      this.hotelRateCoversStay(fact, checkInDate, checkOutDate),
    );
    const sources = this.stringArray(stayFacts.map((fact) => fact.sourceId));

    if (stayFacts.length === 0) {
      return decision;
    }

    const unsafeUnitFacts = stayFacts.filter((fact) => !fact.unit);
    const safeFacts = stayFacts.filter((fact) => fact.unit);
    if (safeFacts.length === 0 && unsafeUnitFacts.length > 0) {
      const reply =
        "Le tarif est indique, mais son unite n'est pas assez claire pour calculer le total: par chambre, par personne ou par nuit ?";
      return {
        ...decision,
        canAnswer: true,
        handoffRequired: false,
        orderDetails: { ...details, total: null, currency: null },
        replyDraft: reply,
        reply,
        sources: this.stringArray(unsafeUnitFacts.map((fact) => fact.sourceId)),
        reason: 'hotel_rate_unit_clarification',
      };
    }

    const options = safeFacts
      .map((fact) => this.calculateHotelRateOption(fact, details))
      .filter(
        (option): option is NonNullable<typeof option> => Boolean(option),
      );
    if (options.length === 0) {
      const reply =
        (details.numberOfChildren ?? 0) > 0
          ? "Il me manque le tarif enfant exact applicable a ces ages pour calculer le total."
          : "Il manque une regle tarifaire explicite pour calculer ce total.";
      return {
        ...decision,
        canAnswer: true,
        handoffRequired: false,
        orderDetails: { ...details, total: null, currency: null },
        replyDraft: reply,
        reply,
        sources,
        reason: 'hotel_price_operand_missing',
      };
    }

    const uniqueOptions = Array.from(
      new Map(options.map((option) => [option.roomType, option])).values(),
    );
    if (requestedRoom === 'suite' && uniqueOptions.length > 1) {
      const optionText = uniqueOptions
        .map(
          (option) =>
            `${option.roomType} ${option.period} a ${this.formatAmount(option.rate)} ${option.currency} par chambre/nuit, soit ${this.formatAmount(option.total)} ${option.currency}`,
        )
        .join(', ou ');
      const reply = `Pour votre sejour du ${details.checkInDate} au ${details.checkOutDate}, cela fait ${details.nights} nuits. J'ai deux options: ${optionText}. Vous souhaitez Junior Suite ou Senior Suite ?`;
      return {
        ...decision,
        canAnswer: true,
        handoffRequired: false,
        orderDetails: {
          ...details,
          total: null,
          currency: null,
          selectedChoice: null,
          missingFields: ['roomType'],
        },
        replyDraft: reply,
        reply,
        sources: this.stringArray(uniqueOptions.map((option) => option.sourceId)),
        reason: 'hotel_room_choice_required',
      };
    }

    const option = uniqueOptions[0];
    const rooms = details.numberOfRooms ?? 1;
    const multiplier = option.unit === 'room_per_night'
      ? `${this.formatAmount(option.rate)} x ${details.nights} x ${rooms}`
      : `${this.formatAmount(option.rate)} x ${details.numberOfAdults} x ${details.nights}`;
    const reply = `Pour votre sejour du ${details.checkInDate} au ${details.checkOutDate}, cela fait ${details.nights} nuits. Le total pour ${option.roomType} ${option.period} est de ${this.formatAmount(option.total)} ${option.currency} (${multiplier}).`;
    return {
      ...decision,
      canAnswer: true,
      handoffRequired: false,
      orderDetails: {
        ...details,
        roomType: option.roomType,
        boardFormula: option.period,
        selectedChoice: option.roomType,
        items: [
          {
            name: option.roomType,
            quantity: option.unit === 'room_per_night' ? rooms : details.numberOfAdults,
            unitPrice: option.rate,
            currency: option.currency,
            subtotal: option.total,
            availability: 'to_confirm',
          },
        ],
        total: option.total,
        currency: option.currency,
      },
      replyDraft: reply,
      reply,
      sources: [option.sourceId],
      reason: 'grounded_hotel_total',
    };
  }

  private extractHotelRateFacts(evidences: RagResultDto['evidences']): Array<{
    roomType: string;
    period: string;
    rate: number;
    currency: string;
    unit: 'room_per_night' | 'person_per_night' | null;
    startDate: string | null;
    endDate: string | null;
    sourceId: string;
  }> {
    const periodRanges = new Map<string, { startDate: string; endDate: string }>();
    for (const evidence of evidences) {
      const period = evidence.content.match(/\b(P[1-9])\b/i)?.[1]?.toUpperCase();
      const range = evidence.content.match(
        /(?:du|from)\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s+(?:au|to)\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
      );
      if (period && range) {
        periodRanges.set(period, { startDate: range[1], endDate: range[2] });
      }
    }

    const facts = [];
    for (const evidence of evidences) {
      const content = this.contentWithoutArticleTitle(evidence);
      const normalized = this.normalizeSearchText(content);
      const roomType = [
        'Junior Suite',
        'Senior Suite',
        'Standard Room',
        'Prestige Room',
        'Promo Room',
        'Family Room',
      ].find((room) => normalized.includes(this.normalizeSearchText(room)));
      const period = content.match(/\b(P[1-9])\b/i)?.[1]?.toUpperCase();
      const amount = content.match(
        /(?:est de|=|:|rate[^\d]{0,20})\s*(\d+(?:[.,]\d+)?)\s*(TND|DT|EUR|USD)\b/i,
      );
      if (!roomType || !period || !amount) continue;

      const range = content.match(
        /(?:du|from)\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s+(?:au|to)\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
      );
      const fallbackRange = periodRanges.get(period);
      const roomPerNight =
        /\b(par chambre(?:\s+par|\s*\/)?\s*nuit|per room per night|room per night)\b/.test(
          normalized,
        );
      const personPerNight =
        /\b(par personne(?:\s+par|\s*\/)?\s*nuit|pax(?:\s+par|\s*\/)?\s*nuit|per person per night)\b/.test(
          normalized,
        );
      facts.push({
        roomType,
        period,
        rate: Number(amount[1].replace(',', '.')),
        currency: amount[2].toUpperCase() === 'DT' ? 'TND' : amount[2].toUpperCase(),
        unit: roomPerNight
          ? ('room_per_night' as const)
          : personPerNight
            ? ('person_per_night' as const)
            : null,
        startDate: range?.[1] ?? fallbackRange?.startDate ?? null,
        endDate: range?.[2] ?? fallbackRange?.endDate ?? null,
        sourceId: String(evidence.id),
      });
    }
    return facts;
  }

  private hotelRateCoversStay(
    fact: { period: string; startDate: string | null; endDate: string | null },
    checkInDate: string,
    checkOutDate: string,
  ): boolean {
    const start = this.parseStayDate(fact.startDate, new Date().getUTCFullYear());
    const end = this.parseStayDate(fact.endDate, start?.getUTCFullYear() ?? new Date().getUTCFullYear());
    const checkIn = this.parseStayDate(checkInDate, start?.getUTCFullYear() ?? new Date().getUTCFullYear());
    const checkOut = this.parseStayDate(checkOutDate, checkIn?.getUTCFullYear() ?? new Date().getUTCFullYear());
    if (!start || !end || !checkIn || !checkOut) {
      return this.requestedPeriods(checkInDate).includes(fact.period);
    }
    const lastNight = new Date(checkOut.getTime() - 24 * 60 * 60 * 1000);
    return checkIn >= start && lastNight <= end;
  }

  private calculateHotelRateOption(
    fact: {
      roomType: string;
      period: string;
      rate: number;
      currency: string;
      unit: 'room_per_night' | 'person_per_night' | null;
      sourceId: string;
    },
    details: WorkflowOrderDetails,
  ) {
    if (!fact.unit || !details.nights) return null;
    if (fact.unit === 'person_per_night' && (details.numberOfChildren ?? 0) > 0) {
      return null;
    }
    const quantity = fact.unit === 'room_per_night'
      ? details.numberOfRooms ?? 1
      : details.numberOfAdults ?? 0;
    if (quantity <= 0) return null;
    return {
      ...fact,
      total: Number((fact.rate * quantity * details.nights).toFixed(2)),
    };
  }

  private formatAmount(value: number): string {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
  }

  private relevantEvidencesForRequest(
    query: string,
    rag: RagResultDto,
  ): RagResultDto['evidences'] {
    if (this.isAvailabilityDatesRequest(query)) {
      return rag.evidences.filter((evidence) =>
        this.hasAvailabilityCalendar([evidence]),
      );
    }

    if (this.isPriceRequest(query)) {
      return this.filterEvidencesForQuery(
        query,
        rag.evidences.filter((evidence) =>
          this.hasPriceFacts(this.contentWithoutArticleTitle(evidence)),
        ),
      );
    }

    if (this.isRoomTypeRequest(query)) {
      return rag.evidences.filter((evidence) =>
        this.hasRoomTypeFacts(this.contentWithoutArticleTitle(evidence)),
      );
    }

    return this.filterEvidencesForQuery(
      query,
      rag.evidences.filter(
        (evidence) => this.contentWithoutArticleTitle(evidence).length >= 20,
      ),
    );
  }

  private filterEvidencesForQuery(
    query: string,
    evidences: RagResultDto['evidences'],
  ): RagResultDto['evidences'] {
    const roomType = this.requestedRoomType(query);
    const periods = this.requestedPeriods(query);
    const normalized = this.normalizeSearchText(query);
    const wantsSeaView = /\b(vue mer|sea view|seaview)\b/.test(normalized);
    const wantsSingle = /\b(single|occupation simple)\b/.test(normalized);
    const wantsMinimumStay =
      /\b(minimum stay|sejour minimum|min stay)\b/.test(normalized);
    const wantsChildReduction =
      /\b(reduction|reduction enfant|child discount|child reduction)\b/.test(
        normalized,
      );

    return evidences.filter((evidence) => {
      const content = this.normalizeSearchText(
        this.contentWithoutArticleTitle(evidence),
      );
      if (roomType && !content.includes(roomType)) return false;
      if (
        periods.length > 0 &&
        !periods.some((period) =>
          new RegExp(`\\b${period.toLowerCase()}\\b`).test(content),
        )
      ) {
        return false;
      }
      if (wantsSeaView && !/\b(vue mer|sea view|seaview)\b/.test(content)) {
        return false;
      }
      if (wantsSingle && !/\b(single|occupation simple)\b/.test(content)) {
        return false;
      }
      if (
        wantsMinimumStay &&
        !/\b(minimum stay|sejour minimum|min stay)\b/.test(content)
      ) {
        return false;
      }
      if (
        wantsChildReduction &&
        !/\b(enfant|child|lit supplementaire|extra bed)\b/.test(content)
      ) {
        return false;
      }
      return true;
    }).sort(
      (left, right) =>
        this.evidencePriority(query, right) -
        this.evidencePriority(query, left),
    );
  }

  private evidencePriority(
    query: string,
    evidence: RagResultDto['evidences'][number],
  ): number {
    const normalizedQuery = this.normalizeSearchText(query);
    const content = this.contentWithoutArticleTitle(evidence);
    if (/\b(vue mer|sea view|seaview)\b/.test(normalizedQuery)) {
      return /\b\d+(?:[.,]\d+)?\s*TND\b/i.test(content) ? 4 : 1;
    }
    if (/\b(minimum stay|sejour minimum|min stay)\b/.test(normalizedQuery)) {
      return /\b\d+\s+nuits?\b/i.test(content) ? 4 : 1;
    }
    if (/\b(reduction|child discount|child reduction)\b/.test(normalizedQuery)) {
      return /\b\d+\s*%/.test(content) ? 4 : 1;
    }
    return this.hasPriceFacts(content) ? 3 : 1;
  }

  private requestedRoomType(value: string): string | null {
    const normalized = this.normalizeSearchText(value);
    const roomTypes = [
      { canonical: 'standard room', aliases: ['standard room', 'chambre standard', 'chambre standars', 'standard'] },
      { canonical: 'prestige room', aliases: ['prestige room', 'chambre prestige', 'prestige'] },
      { canonical: 'promo room', aliases: ['promo room', 'chambre promo', 'promo'] },
      { canonical: 'family room', aliases: ['family room', 'chambre familiale', 'chambre family', 'familiale'] },
      { canonical: 'junior suite', aliases: ['junior suite'] },
      { canonical: 'senior suite', aliases: ['senior suite'] },
    ];
    return (
      roomTypes.find((roomType) =>
        roomType.aliases.some((alias) => normalized.includes(alias)),
      )?.canonical ?? null
    );
  }

  private requestedPeriods(value: string): string[] {
    const normalized = this.normalizeSearchText(value);
    const explicit = normalized.match(/\bp[1-5]\b/g) ?? [];
    if (explicit.length > 0) {
      return Array.from(new Set(explicit.map((period) => period.toUpperCase())));
    }

    const datedMonth = normalized.match(
      /\b(\d{1,2})\s+(juin|june|juillet|july|aout|august|septembre|september|octobre|october)\b/,
    );
    if (datedMonth) {
      const day = Number(datedMonth[1]);
      const month = datedMonth[2];
      if (/juin|june/.test(month)) return ['P1'];
      if (/juillet|july/.test(month)) return [day <= 15 ? 'P2' : 'P3'];
      if (/aout|august/.test(month)) return ['P3'];
      if (/septembre|september/.test(month)) return [day <= 20 ? 'P4' : 'P5'];
      if (/octobre|october/.test(month)) return ['P5'];
    }

    if (/\b(juin|june)\b/.test(normalized)) return ['P1'];
    if (/\b(juillet|july)\b/.test(normalized)) return ['P2', 'P3'];
    if (/\b(aout|august)\b/.test(normalized)) return ['P3'];
    if (/\b(septembre|september)\b/.test(normalized)) return ['P4', 'P5'];
    if (/\b(octobre|october)\b/.test(normalized)) return ['P5'];
    return [];
  }

  private hasKnownBusinessTopic(value: string): boolean {
    const normalized = this.normalizeSearchText(value);
    return /\b(vue mer|sea view|seaview|single|minimum stay|sejour minimum|reduction|child discount|child reduction)\b/.test(
      normalized,
    );
  }

  private hasPriceQueryConstraint(value: string): boolean {
    return Boolean(
      this.requestedRoomType(value) ||
        this.requestedPeriods(value).length > 0 ||
        this.hasKnownBusinessTopic(value),
    );
  }

  private isStayTotalRequest(value: string): boolean {
    const normalized = this.normalizeSearchText(value);
    return (
      /\b(total|total exact|prix exact|tarif exact|cout du sejour|cout total|devis|quote|stay total|combien coute le sejour|combien couterait le sejour)\b/.test(
        normalized,
      ) ||
      (this.isPriceRequest(normalized) &&
        /\b(adulte|adultes|adult|adults|enfant|enfants|child|children|nuit|nuits|night|nights|arrivee|depart|checkin|checkout)\b/.test(
          normalized,
        ))
    );
  }

  private isGenericTariffRequest(value: string): boolean {
    const normalized = this.normalizeSearchText(value)
      .replace(
        /\b(quel|quelle|quels|quelles|est|sont|le|la|les|un|une|des|du|de|svp|please|b2c|prix|tarif|tarifs|price|prices|rate|rates|cost|cout|combien|9addech|9adech|soum|taklfa|query)\b/g,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.length === 0;
  }

  private tariffSearchClarification(language: string): string {
    const normalized = language.toLowerCase();
    if (normalized === 'en' || normalized.startsWith('en_')) {
      return 'Please specify the room type and stay date so I can provide the correct official rate.';
    }
    if (
      normalized === 'tunisian_arabic_latin' ||
      normalized.includes('arabizi') ||
      normalized.includes('tounsi_latin')
    ) {
      return "Aatini type de chambre w date du sejour bech na3tik tarif officiel s7i7.";
    }
    return 'Indiquez le type de chambre et la date du sejour pour obtenir le tarif officiel correspondant.';
  }

  private isPriceRequest(value: string): boolean {
    const normalized = this.normalizeSearchText(value);
    return (
      /\b(prix|tarif|tarifs|b2c|cout|combien|price|prices|rate|rates|cost|9addech|9adech|soum|taklfa)\b/.test(
        normalized,
      ) || /(تكلفة|التكلفة|السعر|الأسعار|قداش)/u.test(value)
    );
  }

  private isRoomTypeRequest(value: string): boolean {
    const normalized = this.normalizeSearchText(value);
    return (
      /\b(type|types|categorie|categories|kind|kinds)\b.*\b(chambre|chambres|room|rooms|suite|suites)\b/.test(
        normalized,
      ) ||
      /\b(chambre|chambres|room|rooms)\b.*\b(existe|existent|available|disponible|types)\b/.test(
        normalized,
      ) ||
      /(أنواع|نوع).*(الغرف|غرفة)/u.test(value)
    );
  }

  private isAvailabilityDatesRequest(value: string): boolean {
    const normalized = this.normalizeSearchText(value);
    const mentionsAvailability =
      /\b(disponible|disponibles|disponibilite|availability|available|free dates|mawjoud|mawjouda)\b/.test(
        normalized,
      ) || /(متاح|متاحة|متوفرة|التوفر)/u.test(value);
    const mentionsDates =
      /\b(date|dates|periode|period|quand|when|arrivee|depart)\b/.test(
        normalized,
      ) || /(تاريخ|تواريخ|فترة|الدخول|الخروج)/u.test(value);

    return mentionsAvailability && mentionsDates;
  }

  private hasAvailabilityCalendar(
    evidences: RagResultDto['evidences'],
  ): boolean {
    return evidences.some((evidence) => {
      const content = this.contentWithoutArticleTitle(evidence);
      const normalized = this.normalizeSearchText(content);
      const hasAvailabilityState =
        /\b(disponible|disponibles|disponibilite|available|availability|complet|complete|sold out|places libres|rooms left)\b/.test(
          normalized,
        ) || /(متاح|متاحة|متوفرة|مكتمل|لا توجد غرف)/u.test(content);
      const hasCalendarValue =
        /\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(content) ||
        /\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
          normalized,
        ) ||
        /\b(toute l annee|all year|chaque jour|every day)\b/.test(normalized);

      return hasAvailabilityState && hasCalendarValue;
    });
  }

  private availabilityDatesClarification(language: string): string {
    const normalized = language.toLowerCase();

    if (
      normalized === 'tunisian_arabic_latin' ||
      normalized.includes('arabizi') ||
      normalized.includes('tounsi_latin')
    ) {
      return "Les dates disponibles mahoumech precises. Aatini date d'entree w date de sortie bech nthabtoulek la disponibilite.";
    }

    if (
      normalized === 'tunisian_arabic' ||
      normalized === 'ar' ||
      normalized === 'arabic' ||
      normalized.includes('arabic_script')
    ) {
      return '\u062a\u0648\u0627\u0631\u064a\u062e \u0627\u0644\u062a\u0648\u0641\u0631 \u063a\u064a\u0631 \u0645\u0630\u0643\u0648\u0631\u0629 \u0641\u064a \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0645\u062a\u0627\u062d\u0629. \u0623\u0631\u0633\u0644 \u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062f\u062e\u0648\u0644 \u0648\u0627\u0644\u062e\u0631\u0648\u062c \u0644\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u062a\u0648\u0641\u0631.';
    }

    if (
      normalized === 'en' ||
      normalized.startsWith('en_') ||
      normalized.includes('english')
    ) {
      return 'Available dates are not specified in the available information. Please provide your check-in and check-out dates so availability can be verified.';
    }

    return "Les dates disponibles ne sont pas pr\u00e9cis\u00e9es dans les informations disponibles. Indiquez vos dates d'arriv\u00e9e et de d\u00e9part pour v\u00e9rifier la disponibilit\u00e9.";
  }

  private buildPriceEvidenceReply(
    language: string,
    evidences: RagResultDto['evidences'],
    query = '',
  ): string {
    const seen = new Set<string>();
    const facts: string[] = [];

    for (const evidence of this.filterEvidencesForQuery(query, evidences)) {
      const content = this.contentWithoutArticleTitle(evidence);
      const segments = content
        .split(/\r?\n+|(?<=[.!?;])\s+/)
        .map((segment) =>
          segment
            .replace(/^[-*\s]+/, '')
            .replace(/^#{1,6}\s*/, '')
            .trim(),
        )
        .filter((segment) => this.hasPriceFacts(segment));

      for (const segment of segments) {
        const key = this.normalizeSearchText(segment);
        if (!key || seen.has(key)) {
          continue;
        }

        seen.add(key);
        facts.push(segment);
        if (facts.length >= 8) {
          break;
        }
      }

      if (facts.length >= 8) {
        break;
      }
    }

    if (!facts.length) {
      return '';
    }

    const intro = this.priceReplyIntro(language);
    const body = facts.length === 1 ? facts[0] : facts.map((fact) => `- ${fact}`).join('\n');
    return `${intro}\n${body}`.slice(0, 1200);
  }

  private priceReplyIntro(language: string): string {
    const normalized = language.toLowerCase();
    if (
      normalized === 'tunisian_arabic' ||
      normalized === 'ar' ||
      normalized === 'arabic'
    ) {
      return '\u0627\u0644\u0623\u0633\u0639\u0627\u0631:';
    }
    if (normalized === 'en' || normalized.startsWith('en_')) {
      return 'Rates:';
    }
    return 'Tarifs B2C :';
  }

  private buildRoomTypesReply(
    language: string,
    evidences: RagResultDto['evidences'],
  ): string {
    const content = evidences
      .map((evidence) => this.contentWithoutArticleTitle(evidence))
      .join(' ');
    const normalized = this.normalizeSearchText(content);
    const types = [
      { matches: /\bstandard(?: room| rooms| chambre| chambres)?\b/, fr: 'Chambres Standard', en: 'Standard Rooms' },
      { matches: /\bprestige(?: room| rooms| chambre| chambres)?\b/, fr: 'Chambres Prestige', en: 'Prestige Rooms' },
      { matches: /\bpromo(?: room| rooms| chambre| chambres)?\b/, fr: 'Chambres Promo', en: 'Promo Rooms' },
      { matches: /\b(?:chambre |chambres |room |rooms )?(?:familiale|familiales|family)\b/, fr: 'Chambres Familiales', en: 'Family Rooms' },
      { matches: /\bjunior suite(?:s)?\b/, fr: 'Junior Suites', en: 'Junior Suites' },
      { matches: /\bsenior suite(?:s)?\b/, fr: 'Senior Suites', en: 'Senior Suites' },
    ].filter((type) => type.matches.test(normalized));

    if (!types.length) {
      return '';
    }

    const normalizedLanguage = language.toLowerCase();
    const labels = types.map((type) =>
      normalizedLanguage === 'en' || normalizedLanguage.startsWith('en_')
        ? type.en
        : type.fr,
    );
    const list = this.joinNaturalList(labels);

    if (
      normalizedLanguage === 'tunisian_arabic_latin' ||
      normalizedLanguage.includes('arabizi') ||
      normalizedLanguage.includes('tounsi_latin')
    ) {
      return `Types de chambres elli mawjouda: ${list}.`;
    }
    if (
      normalizedLanguage === 'tunisian_arabic' ||
      normalizedLanguage === 'ar' ||
      normalizedLanguage === 'arabic'
    ) {
      return `\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u063a\u0631\u0641 \u0627\u0644\u0645\u062a\u0648\u0641\u0631\u0629: ${list}.`;
    }
    if (normalizedLanguage === 'en' || normalizedLanguage.startsWith('en_')) {
      return `The available room types are: ${list}.`;
    }
    return `Les types de chambres disponibles sont : ${list}.`;
  }

  private joinNaturalList(values: string[]): string {
    if (values.length <= 1) {
      return values[0] ?? '';
    }
    return `${values.slice(0, -1).join(', ')} et ${values[values.length - 1]}`;
  }

  private hasPriceFacts(value: string): boolean {
    return (
      /\b\d+(?:[.,]\d{1,3})?\s*(?:tnd|dt|dinar|dinars|eur|usd|\$|\u20ac)\b/i.test(
        value,
      ) ||
      /\b(?:p\d+|prix|tarif|rate)\b[^\n]{0,80}\b\d+(?:[.,]\d{1,3})?\b/i.test(
        value,
      )
    );
  }

  private hasRoomTypeFacts(value: string): boolean {
    const normalized = this.normalizeSearchText(value);
    return /\b(standard|prestige|promo|familiale|familiales|family|junior suite|junior suites|senior suite|senior suites)\b/.test(
      normalized,
    );
  }

  private contentWithoutArticleTitle(
    evidence: RagResultDto['evidences'][number],
  ): string {
    let content = evidence.content.replace(/\s+([,.;:!?])/g, '$1').trim();
    const blocks = content.split(/\n{2,}/);
    if (
      blocks.length > 1 &&
      /\b(section|mots-cles|keywords)\s*:/i.test(blocks[0])
    ) {
      content = blocks.slice(1).join('\n\n').trim();
    }
    const title =
      typeof evidence.metadata?.articleTitle === 'string'
        ? evidence.metadata.articleTitle.trim()
        : '';

    if (title) {
      content = content.replace(new RegExp(this.escapeRegExp(title), 'gi'), ' ');
    }

    return content
      .replace(/(^|\n)\s*[-:.;]+\s*(?=\n|$)/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private isUsefulGroundedReply(reply: string, rag: RagResultDto): boolean {
    const cleaned = this.cleanGroundedReply(reply, rag);
    if (!cleaned) {
      return false;
    }

    const normalized = this.normalizeSearchText(cleaned);
    if (
      /^(voici les informations disponibles|here is the information i found|hedhi l ma3loumet eli l9ithom)$/.test(
        normalized,
      )
    ) {
      return false;
    }

    return normalized.split(/\s+/).filter(Boolean).length >= 3;
  }

  private cleanGroundedReply(reply: string, rag: RagResultDto): string {
    let cleaned = reply.trim();
    for (const title of this.stringArray(
      rag.evidences.map((evidence) => evidence.metadata?.articleTitle),
    )) {
      cleaned = cleaned.replace(new RegExp(this.escapeRegExp(title), 'gi'), ' ');
    }

    const seen = new Set<string>();
    return cleaned
      .split(/\r?\n+/)
      .map((line) => line.replace(/\s+/g, ' ').replace(/^[-*\s]*[:.;-]+\s*/, '').trim())
      .filter((line) => {
        const key = this.normalizeSearchText(line);
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .join('\n')
      .trim();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private ragEvidenceFallbackOutput(
    generation?: WorkflowDecisionGeneration,
  ): WorkflowResponseOutput {
    return {
      source: 'KB',
      provider: generation?.provider ?? 'rag',
      model: generation?.model ?? 'evidence-fallback',
      responseMode: 'KB_DIRECT_DEBUG',
      fallbackUsed: true,
      errorMessage: generation?.errorMessage,
    };
  }

  private mergeGroundedDecision(
    initial: WorkflowAiDecision,
    finalDecision: WorkflowAiDecision,
    rag: RagResultDto,
  ): WorkflowAiDecision {
    const allowed = new Set(
      rag.evidences.slice(0, 8).map((evidence) => String(evidence.id)),
    );
    const sources = finalDecision.sources.filter((source) => allowed.has(source));
    const hasGrounding = rag.hasReliableSources && sources.length > 0;
    const hasUsefulReply = this.isUsefulGroundedReply(finalDecision.reply, rag);
    const canAnswer = finalDecision.canAnswer && hasGrounding && hasUsefulReply;
    const requiresVerification = !hasGrounding || !hasUsefulReply;
    const orderDetails = this.finalizeOrderDetails(
      this.mergeOrderDetails(initial.orderDetails, finalDecision.orderDetails),
    );

    return {
      ...finalDecision,
      normalizedMessage:
        finalDecision.normalizedMessage || initial.normalizedMessage,
      detectedLanguage:
        finalDecision.detectedLanguage || initial.detectedLanguage,
      intent: finalDecision.intent || initial.intent,
      needsRag: true,
      canAnswer,
      handoffRequired:
        finalDecision.handoffRequired || requiresVerification || !rag.hasReliableSources,
      orderIntent: initial.orderIntent || finalDecision.orderIntent,
      orderDetails,
      keywordsForSearch:
        finalDecision.keywordsForSearch.length > 0
          ? finalDecision.keywordsForSearch
          : initial.keywordsForSearch,
      sources,
      reply: requiresVerification
        ? this.verificationReply(finalDecision.detectedLanguage || initial.detectedLanguage)
        : this.cleanGroundedReply(finalDecision.reply, rag),
      reason: requiresVerification
        ? 'ungrounded_company_answer_blocked'
        : finalDecision.reason,
    };
  }

  private parseDecision(rawText: string, fallbackMessage: string): WorkflowAiDecision {
    const parsed = JSON.parse(this.unwrapJson(rawText)) as Record<string, unknown>;

    return {
      normalizedMessage: this.text(parsed.normalizedMessage) || fallbackMessage,
      detectedLanguage: this.text(parsed.detectedLanguage) || 'unknown',
      intent: this.text(parsed.intent) || 'unknown',
      needsRag: parsed.needsRag === true || parsed.needsRAG === true,
      canAnswer: parsed.canAnswer === true,
      handoffRequired: parsed.handoffRequired === true,
      orderIntent: parsed.orderIntent === true,
      orderDetails: this.parseOrderDetails(parsed.orderDetails),
      replyDraft: this.text(parsed.replyDraft),
      reply: this.text(parsed.reply),
      keywordsForSearch: this.stringArray(parsed.keywordsForSearch),
      sources: this.stringArray(parsed.sources),
      confidence: this.confidence(parsed.confidence),
      reason: this.text(parsed.reason) || null,
    };
  }

  private async generateDecisionWithRetry(params: {
    phase: string;
    prompt: string;
    fallbackMessage: string;
    maxOutputTokens: number;
    companyId: string;
    instanceName?: string | null;
    language?: string | null;
  }): Promise<WorkflowDecisionGeneration> {
    let rawText: string | undefined;
    let usage: Usage | undefined;
    let error: unknown;
    let provider: string | undefined;
    let model: string | undefined;
    let fallbackUsed = false;
    let errorMessage: string | undefined;
    let rawResponse: Record<string, unknown> | undefined;
    const attempts: AiProviderAttempt[] = [];

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await this.aiProviderService.generateAnswer({
          userMessage: params.prompt,
          systemPrompt: WORKFLOW_SYSTEM_PROMPT,
          companyId: params.companyId,
          instanceName: params.instanceName,
          language: params.language,
          temperature: 0.1,
          maxOutputTokens: params.maxOutputTokens,
          responseMimeType: 'application/json',
        });
        rawText = result.text;
        usage = this.combineUsage(usage, result.usage);
        provider = result.provider;
        model = result.model;
        fallbackUsed = fallbackUsed || result.fallbackUsed;
        errorMessage = result.errorMessage ?? errorMessage;
        rawResponse = result.rawResponse;
        attempts.push(...result.attempts);

        try {
          return {
            decision: this.parseDecision(result.text, params.fallbackMessage),
            rawText,
            usage,
            provider,
            model,
            fallbackUsed,
            errorMessage,
            attempts,
            rawResponse,
          };
        } catch (parseError) {
          error = parseError;
          this.logger.warn(
            `Workflow ${params.phase} invalid JSON attempt=${attempt}: ${this.errorMessage(parseError)}`,
          );
        }
      } catch (generationError) {
        error = generationError;
        errorMessage = this.errorMessage(generationError);

        if (generationError instanceof AiProviderGenerationError) {
          attempts.push(...generationError.attempts);
          fallbackUsed = fallbackUsed || generationError.fallbackUsed;
          const finalAttempt =
            generationError.attempts[generationError.attempts.length - 1];
          provider = finalAttempt?.provider ?? provider;
          model = finalAttempt?.model ?? model;
        }

        this.logger.warn(
          `Workflow ${params.phase} generation failed attempt=${attempt}: ${this.errorMessage(generationError)}`,
        );
      }
    }

    return {
      decision: null,
      rawText,
      usage,
      error,
      provider,
      model,
      fallbackUsed,
      errorMessage: errorMessage ?? this.errorMessage(error),
      attempts,
      rawResponse,
    };
  }

  private buildResponse(
    decision: WorkflowAiDecision,
    payload: AiReplyRequestDto,
    companyId: string,
    conversation: ConversationContext,
    rag: RagResultDto | null,
    orderActionPrepared: boolean,
    output?: WorkflowResponseOutput,
    usedVision = false,
  ): AiReplyResponseDto {
    const reply = this.sanitizeReply(decision.reply);
    const shouldSendMessage = reply.length > 0;
    const usedKb = Boolean(decision.needsRag && decision.canAnswer && decision.sources.length);

    return new AiReplyResponseDto({
      normalizedMessage: decision.normalizedMessage,
      detectedLanguage: decision.detectedLanguage,
      intent: decision.intent,
      needsRag: decision.needsRag,
      canAnswer: decision.canAnswer,
      handoffRequired: decision.handoffRequired,
      orderIntent: decision.orderIntent,
      orderDetails: decision.orderDetails,
      replyDraft: decision.replyDraft,
      keywordsForSearch: decision.keywordsForSearch,
      shouldSendMessage,
      answer: reply,
      reply,
      replyText: shouldSendMessage ? reply : null,
      safe: true,
      canSendFreeForm: true,
      source: output?.source ?? 'LLM',
      provider: output?.provider ?? this.aiProviderService.getConfiguredProvider(),
      model: output?.model ?? '',
      fallbackUsed: output?.fallbackUsed ?? false,
      errorMessage: output?.errorMessage ?? null,
      responseMode:
        output?.responseMode ??
        (decision.handoffRequired
          ? 'HANDOFF_REQUIRED'
          : usedKb
            ? 'KB_WITH_LLM'
            : 'LLM_ONLY'),
      usedKb,
      sourceChunkIds: rag?.sourceChunkIds ?? [],
      sourceArticleIds: rag?.sourceArticleIds ?? [],
      retrievedChunksPreview: rag?.retrievedChunksPreview ?? [],
      reason: decision.reason,
      sources: decision.sources,
      confidence: decision.confidence,
      tagsToApply: decision.orderIntent
        ? this.requestTagsForAction(decision.orderDetails.actionType)
        : [],
      action: decision.orderIntent
        ? 'prepare_customer_request'
        : decision.handoffRequired
          ? 'handoff'
          : 'reply_ready',
      messageType: payload.messageType ?? 'unknown',
      debug: {
        usedRag: Boolean(rag),
        usedVision,
        usedAudioTranscription: false,
        usedConversationContext: true,
        companyId,
        conversationId: conversation.id,
      },
      metadata: {
        ragSourcesFound: rag?.hasReliableSources ?? false,
        orderActionPrepared,
        evidenceFallback: output?.source === 'KB',
      },
    });
  }

  private responseProviderOutput(
    generation?: WorkflowDecisionGeneration,
  ):
    | {
        source: 'LLM';
        provider: string;
        model: string;
        fallbackUsed: boolean;
        errorMessage?: string;
      }
    | undefined {
    if (!generation?.provider || !generation.model) {
      return undefined;
    }

    return {
      source: 'LLM',
      provider: generation.provider,
      model: generation.model,
      fallbackUsed: generation.fallbackUsed,
      errorMessage: generation.errorMessage,
    };
  }

  private buildNoReplyResponse(
    message: string,
    reason: string,
    missingFields: string[] = [],
    handoffRequired = true,
  ): AiReplyResponseDto {
    return new AiReplyResponseDto({
      normalizedMessage: message,
      detectedLanguage: 'unknown',
      intent: 'unknown',
      needsRag: false,
      canAnswer: false,
      handoffRequired,
      orderIntent: false,
      orderDetails: this.emptyOrderDetails(),
      replyDraft: '',
      keywordsForSearch: [],
      shouldSendMessage: false,
      answer: '',
      reply: '',
      replyText: null,
      safe: true,
      canSendFreeForm: true,
      source: 'FALLBACK',
      provider: 'not_called',
      model: '',
      responseMode: handoffRequired ? 'HANDOFF_REQUIRED' : 'LLM_ONLY',
      usedKb: false,
      reason,
      action: handoffRequired ? 'handoff' : 'ignored',
      missingFields,
    });
  }

  private buildMediaClarificationResponse(
    mediaType: string,
    reply: string,
    usedVision = false,
  ): AiReplyResponseDto {
    return new AiReplyResponseDto({
      normalizedMessage: '',
      detectedLanguage: 'fr',
      intent: 'MEDIA_CLARIFICATION',
      needsRag: false,
      canAnswer: true,
      handoffRequired: false,
      needsClarification: true,
      orderIntent: false,
      orderDetails: this.emptyOrderDetails(),
      replyDraft: reply,
      shouldSendMessage: true,
      answer: reply,
      reply,
      replyText: reply,
      safe: true,
      canSendFreeForm: true,
      source: 'FALLBACK',
      provider: usedVision ? 'gemini-vision' : 'not_called',
      model: '',
      responseMode: 'LLM_ONLY',
      usedKb: false,
      reason: 'media_requires_clarification',
      action: 'request_clarification',
      messageType: mediaType,
      debug: {
        usedRag: false,
        usedVision,
        usedAudioTranscription: false,
        usedConversationContext: true,
        companyId: null,
        conversationId: null,
      },
    });
  }

  private buildTechnicalFailureResponse(
    message: string,
    reason: string,
    generation?: WorkflowDecisionGeneration,
    decision?: WorkflowAiDecision,
    fallbackLanguage?: string,
  ): AiReplyResponseDto {
    const response = this.buildNoReplyResponse(message, reason);
    const language =
      decision?.detectedLanguage ||
      fallbackLanguage ||
      this.detectFallbackLanguage(message);
    // Provider failure: use specific handoff transfer message, not "missing info"
    const reply = this.handoffTransferReply(language);

    if (decision) {
      response.normalizedMessage = decision.normalizedMessage;
      response.detectedLanguage = decision.detectedLanguage;
      response.intent = decision.intent;
      response.needsRag = decision.needsRag;
      response.orderIntent = decision.orderIntent;
      response.orderDetails = decision.orderDetails;
      response.keywordsForSearch = decision.keywordsForSearch;
    } else {
      response.detectedLanguage = language;
    }

    response.replyDraft = reply;
    response.shouldSendMessage = true;
    response.answer = reply;
    response.reply = reply;
    response.replyText = reply;
    response.provider = generation?.provider ?? this.aiProviderService.getConfiguredProvider();
    response.model = generation?.model ?? '';
    response.fallbackUsed = generation?.fallbackUsed ?? false;
    response.errorMessage =
      generation?.errorMessage ??
      (generation?.error ? this.errorMessage(generation.error) : null);

    return response;
  }

  private detectFallbackLanguage(message: string): string {
    return this.detectLanguageHint(message) ?? 'fr';
  }

  private detectLanguageHint(message: string): string | null {
    const normalized = this.normalizeSearchText(message);

    if (/\b(english|in english|answer in english)\b/.test(normalized)) {
      return 'en';
    }

    if (/\b(francais|en francais|repondez en francais)\b/.test(normalized)) {
      return 'fr';
    }

    if (/[\u0600-\u06ff]/u.test(message)) {
      return 'ar';
    }

    if (
      /\b(a7ki|tounsi|nheb|n7eb|9addech|9adech|twasslou|touslou|mte3ek|ya3tik)\b/.test(
        normalized,
      )
    ) {
      return 'tunisian_arabic_latin';
    }

    if (
      /\b(hello|what|which|do|can|have|available|price|delivery|order|please)\b/.test(
        normalized,
      )
    ) {
      return 'en';
    }

    if (
      /\b(bonjour|bonsoir|avez|voudrais|prix|plat|plats|livraison|commande|repondez|svp)\b/.test(
        normalized,
      )
    ) {
      return 'fr';
    }

    return null;
  }

  private detectFallbackLanguageFromHistory(
    message: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): string {
    return (
      this.detectLanguageHint(message) ??
      this.detectLanguageHint(
        history
          .slice(-10)
          .reverse()
          .map((item) => item.content)
          .join(' '),
      ) ??
      'fr'
    );
  }

  /**
   * Detect strong frustration, complaint or explicit human-agent request signals
   * before calling the LLM. Returns the signal if found, null otherwise.
   */
  private detectCustomerFrustration(
    message: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): { triggered: boolean; reason: string; language: string } | null {
    const normalized = this.normalizeSearchText(message);
    const language = this.detectFallbackLanguageFromHistory(message, history);

    // Strong complaint / frustration keywords (FR, Arabizi, AR)
    const isFrustrated =
      /\b(pas content|mecontent|insatisfait|decu|scandaleux|inadmissible|inacceptable|intolerable|j en ai marre|trop nul|c est nul|service nul|ridicule|honteux|exige|exiger|remboursement|rembours|plainte|reclamation|reclam|j appelle|je vais porter plainte|porter plainte|aberrant|catastrophique|deplorable|lamentable)\b/.test(
        normalized,
      ) ||
      /\b(mch mradhi|mch rahi|hasha|ma 3ajibni|ma a3jabni|nchki|nshki|m3asseb|kbir el mazel|3ayeb|bghit nkellim|ta3ban|fama probleme kabir|mech normal|msh normal|na9es|bnin mch)\b/.test(
        normalized,
      ) ||
      /(غاضب|غضبان|تذمر|أتظلم|أشكو|غير راضي|مستاء|تعويض|استرجاع|فضيحة|هذا عيب|هذا مصيبة|أطالب بحقي)/u.test(
        message,
      );

    // Explicit human-agent request
    const wantsHuman =
      /\b(agent humain|humain|human agent|operateur|conseiller|parler a quelqu|parler avec quelqu|je veux parler|je veux un agent|i want to speak|speak to someone|connect me|transfer me|responsable|directeur|directrice|manager|superviseur|superieur|votre responsable)\b/.test(
        normalized,
      ) ||
      /\b(nabi nkellim wa7ed|bghit nkellim wa7ed|nkellim wa7ed|bghit wa7ed|na9el liya|transférer)\b/.test(
        normalized,
      ) ||
      /(أريد إنسان|أريد شخص|أريد مسؤول|اريد مسؤول|تحدث مع مسؤول|تحويل لمسؤول|مسؤول|مدير)/u.test(
        message,
      );

    if (isFrustrated || wantsHuman) {
      return {
        triggered: true,
        reason: wantsHuman ? 'explicit_human_agent_request' : 'customer_frustration_detected',
        language,
      };
    }

    // Detect stuck customer: same question repeated 3+ times in last 8 user messages
    const recentUserMessages = history
      .filter((item) => item.role === 'user')
      .slice(-8)
      .map((item) => this.normalizeSearchText(item.content));

    if (recentUserMessages.length >= 3) {
      const currentWords = new Set(
        normalized.split(' ').filter((word) => word.length > 3),
      );
      if (currentWords.size > 0) {
        const repeatedCount = recentUserMessages.filter((msg) => {
          const msgWords = msg.split(' ').filter((word) => word.length > 3);
          if (!msgWords.length) return false;
          const matchCount = msgWords.filter((word) => currentWords.has(word)).length;
          return matchCount / Math.max(currentWords.size, msgWords.length) >= 0.55;
        }).length;

        if (repeatedCount >= 3) {
          return {
            triggered: true,
            reason: 'customer_stuck_repeated_question',
            language,
          };
        }
      }
    }

    return null;
  }

  /** Polite handoff transfer message used when all AI providers fail or frustration is detected. */
  private handoffTransferReply(language: string): string {
    const normalized = (language ?? '').toLowerCase();

    if (
      normalized === 'tunisian_arabic_latin' ||
      normalized.includes('arabizi') ||
      normalized.includes('tounsi_latin')
    ) {
      return 'Chokran 3la rassaltek. Bech na3mel transfert mt3ek l wa7ed min el agents mte3na bech yjawbek b precision.';
    }
    if (
      normalized === 'tunisian_arabic' ||
      normalized === 'ar' ||
      normalized === 'arabic' ||
      normalized.includes('arabic_script')
    ) {
      return 'شكرًا على رسالتك. سنقوم بتحويل طلبك إلى أحد وكلائنا البشريين للرد عليك بدقة.';
    }
    if (normalized === 'en' || normalized.startsWith('en_') || normalized.includes('english')) {
      return 'Thank you for your message. I will transfer your request to a human agent who will assist you with more precision.';
    }
    return 'Merci pour votre message. Je vais transférer votre demande à un agent humain afin de vous répondre avec plus de précision.';
  }

  /** Build a handoff response that sends a polite transfer message to the customer. */
  private buildFrustrationHandoffResponse(
    message: string,
    reason: string,
    reply: string,
  ): AiReplyResponseDto {
    const base = this.buildNoReplyResponse(message, reason);
    base.replyDraft = reply;
    base.shouldSendMessage = true;
    base.answer = reply;
    base.reply = reply;
    base.replyText = reply;
    base.provider = 'not_called';
    base.model = '';
    return base;
  }

  private async persistResponse(params: {
    payload: AiReplyRequestDto;
    response: AiReplyResponseDto;
    startedAt: number;
    companyId?: string;
    conversation?: ConversationContext;
    rag?: RagResultDto | null;
    usage?: Usage;
    providerResponses?: WorkflowProviderResponses;
  }): Promise<AiReplyResponseDto> {
    const providerGenerations = Object.values(params.providerResponses ?? {});
    const providerErrors = providerGenerations
      .map((generation) => generation.errorMessage)
      .filter((message): message is string => Boolean(message));
    params.response.fallbackUsed =
      params.response.fallbackUsed ||
      providerGenerations.some((generation) => generation.fallbackUsed);
    params.response.errorMessage =
      params.response.errorMessage ??
      providerErrors[providerErrors.length - 1] ??
      null;

    if (
      !params.companyId ||
      !params.conversation?.id ||
      !params.payload.messageId?.trim()
    ) {
      return params.response;
    }

    const aiRun = await this.aiRunsRepository.create({
      companyId: params.companyId ?? params.payload.companyId,
      conversationId: params.conversation?.id ?? params.payload.conversationId,
      contactId: params.payload.contactId,
      messageId: params.payload.messageId,
      prompt: params.payload.message ?? params.payload.messageText ?? '',
      inputType: params.payload.messageType ?? 'text',
      response: params.response.reply,
      normalizedMessage: params.response.normalizedMessage,
      detectedLanguage: params.response.detectedLanguage,
      intent: params.response.intent,
      needsRag: params.response.needsRag,
      ragSources: params.rag?.sources ?? params.response.sources,
      canAnswer: params.response.canAnswer,
      orderIntent: params.response.orderIntent,
      provider: params.response.provider,
      model: params.response.model,
      responseMode: params.response.responseMode,
      usedKb: params.response.usedKb,
      sourceArticleIds: params.response.sourceArticleIds,
      sourceChunkIds: params.response.sourceChunkIds,
      retrievedChunksPreview: params.response.retrievedChunksPreview,
      status: params.response.shouldSendMessage ? 'success' : 'blocked',
      reason: params.response.reason ?? undefined,
      shouldSendMessage: params.response.shouldSendMessage,
      latencyMs: Date.now() - params.startedAt,
      promptTokens: params.usage?.promptTokens ?? undefined,
      completionTokens: params.usage?.completionTokens ?? undefined,
      tokensUsed: params.usage?.totalTokens ?? undefined,
      confidenceScore: params.response.confidence,
      handoffRequired: params.response.handoffRequired,
      tagsToApply: params.response.tagsToApply,
      errorMessage: params.response.errorMessage ?? undefined,
      fallbackUsed: params.response.fallbackUsed,
      rawResponse: {
        structuredOutput: {
          normalizedMessage: params.response.normalizedMessage,
          detectedLanguage: params.response.detectedLanguage,
          intent: params.response.intent,
          needsRag: params.response.needsRag,
          canAnswer: params.response.canAnswer,
          handoffRequired: params.response.handoffRequired,
          orderIntent: params.response.orderIntent,
          orderDetails: params.response.orderDetails,
          replyDraft: params.response.replyDraft,
          reply: params.response.reply,
          keywordsForSearch: params.response.keywordsForSearch,
        },
        providerResponses: Object.fromEntries(
          Object.entries(params.providerResponses ?? {}).map(([phase, generation]) => [
            phase,
            {
              text: generation.rawText ?? null,
              provider: generation.provider ?? null,
              model: generation.model ?? null,
              fallbackUsed: generation.fallbackUsed,
              errorMessage: generation.errorMessage ?? null,
              attempts: generation.attempts,
              rawResponse: generation.rawResponse ?? null,
            },
          ]),
        ),
        fallbackUsed: params.response.fallbackUsed,
        errorMessage: params.response.errorMessage,
        ragSourcesFound: params.rag?.hasReliableSources ?? false,
      },
    });

    params.response.aiRunId = aiRun.id;
    return params.response;
  }

  private async prepareCustomerRequest(
    decision: WorkflowAiDecision,
    companyId: string,
    conversation: ConversationContext,
  ): Promise<boolean> {
    try {
      const contact = await this.prisma.contact.findFirst({
        where: {
          id: conversation.contactId,
          companyId,
        },
        select: {
          id: true,
          tags: true,
        },
      });

      if (!contact) {
        this.logger.warn(
          `CUSTOMER_REQUEST_NOT_PREPARED reason=contact_scope_mismatch conversationId=${conversation.id} companyId=${companyId}`,
        );
        return false;
      }

      const requestTags = this.requestTagsForAction(decision.orderDetails.actionType);
      const tags = Array.from(
        new Set([...this.stringArray(contact.tags), ...requestTags]),
      );
      const details = decision.orderDetails;
      const lastAiDecision = JSON.stringify({
        source: 'llm_workflow_ai',
        orderIntent: true,
        intent: decision.intent,
        normalizedMessage: decision.normalizedMessage,
        detectedLanguage: decision.detectedLanguage,
        orderDetails: details,
        keywordsForSearch: decision.keywordsForSearch,
        nextAction: 'prepare_customer_request',
      });

      await this.prisma.$transaction([
        this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            customerIntent: decision.intent,
            requestedProductService: details.requestedItem ?? undefined,
            requestedDeliveryDate: details.requestedDate ?? undefined,
            deliveryAddress: details.address ?? undefined,
            nextAction: 'prepare_customer_request',
            lastAiDecision,
            updatedAt: new Date(),
          },
        }),
        this.prisma.contact.update({
          where: { id: contact.id },
          data: {
            tags,
            fullName: details.customerName ?? undefined,
            phone: details.phone ?? undefined,
            language:
              decision.detectedLanguage !== 'unknown'
                ? decision.detectedLanguage
                : undefined,
            updatedAt: new Date(),
          },
        }),
        ...requestTags.map((tag) =>
          this.prisma.conversationTag.upsert({
            where: {
              conversationId_tag: {
                conversationId: conversation.id,
                tag,
              },
            },
            update: {
              companyId,
            },
            create: {
              companyId,
              conversationId: conversation.id,
              tag,
              createdAt: new Date(),
            },
          }),
        ),
      ]);

      this.logger.log(
        `CUSTOMER_REQUEST_PREPARED conversationId=${conversation.id} companyId=${companyId} contactId=${conversation.contactId}`,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Customer request preparation failed without blocking reply: ${this.errorMessage(error)}`,
      );
      return false;
    }
  }

  private sanitizeReply(reply: string): string {
    const clean = reply.trim();
    if (!clean) return '';

    if (
      /^\s*[{[]/.test(clean) ||
      /\b(?:source id|article id|chunk(?: id)?|metadata|metadonnees|embedding|retrieval score|score rag|rag|knowledge base|base de connaissances|system prompt|prompt systeme|internal prompt|prompt interne|informations obligatoires avant un calcul|instructions? de calcul|limites? internes?)\b/i.test(
        clean,
      )
    ) {
      return '';
    }

    return clean.slice(0, 1200);
  }

  private unwrapJson(rawText: string): string {
    const trimmed = rawText.replace(/^\uFEFF/, '').trim();
    const withoutOpeningFence = trimmed.replace(/^```(?:json)?\s*/i, '').trim();
    const withoutFence = withoutOpeningFence.replace(/\s*```\s*$/i, '').trim();

    return this.extractJsonValue(withoutFence) ?? withoutFence;
  }

  private extractJsonValue(text: string): string | null {
    const objectStart = text.indexOf('{');
    const arrayStart = text.indexOf('[');
    const start =
      objectStart < 0
        ? arrayStart
        : arrayStart < 0
          ? objectStart
          : Math.min(objectStart, arrayStart);

    if (start < 0) {
      return null;
    }

    const opening = text[start];
    const closing = opening === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === opening) {
        depth += 1;
      } else if (char === closing && --depth === 0) {
        return text.slice(start, index + 1);
      }
    }

    return null;
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ).slice(0, 12)
      : [];
  }

  private parseOrderDetails(value: unknown): WorkflowOrderDetails {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.emptyOrderDetails();
    }

    const details = value as Record<string, unknown>;
    return {
      actionType: this.text(details.actionType) || null,
      customerName: this.text(details.customerName) || null,
      requestedItem: this.text(details.requestedItem) || null,
      quantity: this.text(details.quantity) || null,
      requestedDate: this.text(details.requestedDate) || null,
      address: this.text(details.address) || null,
      phone: this.text(details.phone) || null,
      notes: this.text(details.notes) || null,
      items: this.parseOrderItems(details.items),
      total: this.numberValue(details.total),
      currency: this.text(details.currency) || null,
      availability: this.text(details.availability) || null,
      confirmationStatus: this.text(details.confirmationStatus) || null,
      missingFields: this.stringArray(details.missingFields),
      checkInDate: this.text(details.checkInDate) || null,
      checkOutDate: this.text(details.checkOutDate) || null,
      nights: this.numberValue(details.nights),
      numberOfAdults: this.numberValue(details.numberOfAdults),
      numberOfChildren: this.numberValue(details.numberOfChildren),
      childrenAges: this.text(details.childrenAges) || null,
      roomType: this.text(details.roomType) || null,
      boardFormula: this.text(details.boardFormula) || null,
      numberOfRooms: this.numberValue(details.numberOfRooms),
      selectedChoice: this.text(details.selectedChoice) || null,
    };
  }

  private mergeOrderDetails(
    initial: WorkflowOrderDetails,
    finalDetails: WorkflowOrderDetails,
  ): WorkflowOrderDetails {
    return {
      actionType: finalDetails.actionType ?? initial.actionType,
      customerName: finalDetails.customerName ?? initial.customerName,
      requestedItem: finalDetails.requestedItem ?? initial.requestedItem,
      quantity: finalDetails.quantity ?? initial.quantity,
      requestedDate: finalDetails.requestedDate ?? initial.requestedDate,
      address: finalDetails.address ?? initial.address,
      phone: finalDetails.phone ?? initial.phone,
      notes: finalDetails.notes ?? initial.notes,
      items: this.mergeOrderItems(initial.items, finalDetails.items),
      total: finalDetails.total ?? initial.total,
      currency: finalDetails.currency ?? initial.currency,
      availability: finalDetails.availability ?? initial.availability,
      confirmationStatus:
        finalDetails.confirmationStatus ?? initial.confirmationStatus,
      missingFields: finalDetails.missingFields,
      checkInDate: finalDetails.checkInDate ?? initial.checkInDate,
      checkOutDate: finalDetails.checkOutDate ?? initial.checkOutDate,
      nights: finalDetails.nights ?? initial.nights,
      numberOfAdults: finalDetails.numberOfAdults ?? initial.numberOfAdults,
      numberOfChildren: finalDetails.numberOfChildren ?? initial.numberOfChildren,
      childrenAges: finalDetails.childrenAges ?? initial.childrenAges,
      roomType: finalDetails.roomType ?? initial.roomType,
      boardFormula: finalDetails.boardFormula ?? initial.boardFormula,
      numberOfRooms: finalDetails.numberOfRooms ?? initial.numberOfRooms,
      selectedChoice: finalDetails.selectedChoice ?? initial.selectedChoice,
    };
  }

  private emptyOrderDetails(): WorkflowOrderDetails {
    return {
      actionType: null,
      customerName: null,
      requestedItem: null,
      quantity: null,
      requestedDate: null,
      address: null,
      phone: null,
      notes: null,
      items: [],
      total: null,
      currency: null,
      availability: null,
      confirmationStatus: null,
      missingFields: [],
      checkInDate: null,
      checkOutDate: null,
      nights: null,
      numberOfAdults: null,
      numberOfChildren: null,
      childrenAges: null,
      roomType: null,
      boardFormula: null,
      numberOfRooms: null,
      selectedChoice: null,
    };
  }

  private parseOrderItems(value: unknown): WorkflowOrderItem[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Record<string, unknown> => {
        return Boolean(item && typeof item === 'object' && !Array.isArray(item));
      })
      .map((item) => ({
        name: this.text(item.name),
        quantity: this.numberValue(item.quantity),
        unitPrice: this.numberValue(item.unitPrice),
        currency: this.text(item.currency) || null,
        subtotal: this.numberValue(item.subtotal),
        availability: this.text(item.availability) || null,
      }))
      .filter((item) => Boolean(item.name))
      .slice(0, 20);
  }

  private mergeOrderItems(
    initial: WorkflowOrderItem[],
    finalItems: WorkflowOrderItem[],
  ): WorkflowOrderItem[] {
    const merged = new Map<string, WorkflowOrderItem>();

    for (const item of initial) {
      merged.set(this.normalizeSearchText(item.name), item);
    }

    for (const item of finalItems) {
      const key = this.normalizeSearchText(item.name);
      const previous = merged.get(key);
      merged.set(key, {
        name: item.name || previous?.name || '',
        quantity: item.quantity ?? previous?.quantity ?? null,
        unitPrice: item.unitPrice ?? previous?.unitPrice ?? null,
        currency: item.currency ?? previous?.currency ?? null,
        subtotal: item.subtotal ?? previous?.subtotal ?? null,
        availability: item.availability ?? previous?.availability ?? null,
      });
    }

    return Array.from(merged.values()).filter((item) => Boolean(item.name));
  }

  private finalizeOrderDetails(details: WorkflowOrderDetails): WorkflowOrderDetails {
    const actionType = (details.actionType ?? '').toLowerCase();

    if (['reservation', 'booking'].includes(actionType)) {
      const nights = this.calculateNights(details.checkInDate, details.checkOutDate);
      const missingFields: string[] = [];
      if (!details.checkInDate) missingFields.push('checkInDate');
      if (!details.checkOutDate) missingFields.push('checkOutDate');
      if (!details.numberOfAdults) missingFields.push('numberOfAdults');
      if (details.numberOfChildren === null) {
        missingFields.push('numberOfChildren');
      }
      if ((details.numberOfChildren ?? 0) > 0 && !details.childrenAges) {
        missingFields.push('childrenAges');
      }
      if (!details.roomType) missingFields.push('roomType');
      const confirmationStatus =
        details.confirmationStatus ??
        (missingFields.length ? 'collecting_details' : 'to_verify');
      return {
        ...details,
        nights: nights ?? details.nights,
        missingFields,
        confirmationStatus,
      };
    }

    if (!['order', 'purchase'].includes(actionType)) {
      return details;
    }

    const missingFields: string[] = [];
    if (!details.customerName) missingFields.push('customerName');
    if (!details.phone) missingFields.push('phone');
    if (!details.address) missingFields.push('address');
    if (!details.items.length) {
      missingFields.push('items');
    } else if (details.items.some((item) => item.quantity === null)) {
      missingFields.push('quantities');
    }

    const items = details.items.map((item) => ({
      ...item,
      subtotal:
        item.quantity !== null && item.unitPrice !== null
          ? Number((item.quantity * item.unitPrice).toFixed(2))
          : null,
    }));
    const currencies = Array.from(
      new Set(
        items
          .map((item) => item.currency?.trim().toUpperCase() ?? '')
          .filter(Boolean),
      ),
    );
    const canCalculateTotal =
      items.length > 0 &&
      items.every(
        (item) =>
          item.quantity !== null &&
          item.unitPrice !== null &&
          item.subtotal !== null &&
          Boolean(item.currency?.trim()),
      ) &&
      currencies.length === 1;
    const calculatedTotal = canCalculateTotal
      ? Number(
          items
            .reduce((total, item) => total + (item.subtotal ?? 0), 0)
            .toFixed(2),
        )
      : null;

    return {
      ...details,
      items,
      total: calculatedTotal,
      currency: canCalculateTotal ? currencies[0] : null,
      confirmationStatus:
        details.confirmationStatus ??
        (missingFields.length ? 'collecting_details' : null),
      missingFields,
    };
  }

  private calculateNights(
    checkInDate: string | null,
    checkOutDate: string | null,
    preferredYear = new Date().getUTCFullYear(),
  ): number | null {
    const checkIn = this.parseStayDate(checkInDate, preferredYear);
    const checkOut = this.parseStayDate(checkOutDate, checkIn?.getUTCFullYear() ?? preferredYear);
    if (!checkIn || !checkOut) return null;

    if (checkOut.getTime() <= checkIn.getTime() && !/\b\d{4}\b/.test(checkOutDate ?? '')) {
      checkOut.setUTCFullYear(checkOut.getUTCFullYear() + 1);
    }

    const nights = Math.round(
      (checkOut.getTime() - checkIn.getTime()) / (24 * 60 * 60 * 1000),
    );
    return nights > 0 && nights < 370 ? nights : null;
  }

  private parseStayDate(value: string | null, defaultYear: number): Date | null {
    if (!value?.trim()) return null;
    const normalized = this.normalizeSearchText(value);
    const iso = normalized.match(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
    if (iso) {
      return this.validUtcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    }

    const numeric = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
    if (numeric) {
      const rawYear = numeric[3] ? Number(numeric[3]) : defaultYear;
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      return this.validUtcDate(year, Number(numeric[2]), Number(numeric[1]));
    }

    const monthNumbers: Record<string, number> = {
      janvier: 1,
      january: 1,
      fevrier: 2,
      february: 2,
      mars: 3,
      march: 3,
      avril: 4,
      april: 4,
      mai: 5,
      may: 5,
      juin: 6,
      june: 6,
      juillet: 7,
      july: 7,
      aout: 8,
      august: 8,
      septembre: 9,
      september: 9,
      octobre: 10,
      october: 10,
      novembre: 11,
      november: 11,
      decembre: 12,
      december: 12,
    };
    const named = normalized.match(
      /\b(\d{1,2})\s+(janvier|january|fevrier|february|mars|march|avril|april|mai|may|juin|june|juillet|july|aout|august|septembre|september|octobre|october|novembre|november|decembre|december)(?:\s+(\d{4}))?\b/,
    );
    if (!named) return null;
    return this.validUtcDate(
      named[3] ? Number(named[3]) : defaultYear,
      monthNumbers[named[2]],
      Number(named[1]),
    );
  }

  private validUtcDate(year: number, month: number, day: number): Date | null {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? date
      : null;
  }

  private numberValue(value: unknown): number | null {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number(value.replace(',', '.'))
          : Number.NaN;

    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  private requestTagsForAction(actionType: string | null): string[] {
    const normalized = (actionType ?? '').trim().toLowerCase();
    const tag =
      normalized === 'reservation' || normalized === 'booking'
        ? 'demande_reservation'
        : normalized === 'appointment' || normalized === 'rendez_vous'
          ? 'demande_rendez_vous'
          : normalized === 'quote_request' || normalized === 'quote'
            ? 'demande_devis'
            : normalized === 'order' || normalized === 'purchase'
              ? 'demande_commande'
              : null;

    return tag ? ['demande_client', tag] : ['demande_client'];
  }

  private confidence(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? Number(Math.max(0, Math.min(1, value)).toFixed(2))
      : 0;
  }

  private combineUsage(first?: Usage, second?: Usage): Usage | undefined {
    if (!first && !second) return undefined;

    const add = (a: number | null | undefined, b: number | null | undefined) =>
      a === null && b === null ? null : (a ?? 0) + (b ?? 0);

    return {
      promptTokens: add(first?.promptTokens, second?.promptTokens),
      completionTokens: add(first?.completionTokens, second?.completionTokens),
      totalTokens: add(first?.totalTokens, second?.totalTokens),
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown_error';
  }
}
