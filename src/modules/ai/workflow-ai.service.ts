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
  lastCustomerMessageAt: Date | null;
  lastAiDecision: string | null;
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
  ) {}

  async generateReply(
    payload: AiReplyRequestDto,
    actor?: AuthenticatedUser,
    options?: { enforceWorkflowPayload?: boolean },
  ): Promise<AiReplyResponseDto> {
    const startedAt = Date.now();
    const message = (payload.message ?? payload.messageText ?? '').trim();
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
        intent: 'BUSINESS_QUERY',
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
        lastCustomerMessageAt: true,
        lastAiDecision: true,
        messages: {
          select: { direction: true, content: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
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
      return payload.history.map((item) => ({
        role: item.role,
        content: item.content,
      }));
    }

    return conversation.messages
      .slice()
      .reverse()
      .filter((item) => Boolean(item.content?.trim()))
      .map((item) => ({
        role: item.direction === 'inbound' ? 'user' : 'assistant',
        content: item.content?.trim() ?? '',
      }));
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
    const orderDetails = continuesOrder
      ? this.finalizeOrderDetails(
          this.retainPreviouslyGroundedFacts(
            accumulatedOrderDetails,
            reusablePreviousOrderDetails,
          ),
        )
      : decision.orderDetails;

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
          unitPrice: prior?.unitPrice ?? null,
          currency: prior?.currency ?? previous?.currency ?? null,
          subtotal: prior?.subtotal ?? null,
          availability: prior?.availability ?? null,
        };
      }),
      total: previous?.total ?? null,
      currency: previous?.currency ?? null,
      availability: previous?.availability ?? null,
      confirmationStatus: previous?.confirmationStatus ?? details.confirmationStatus,
    };
  }

  private requiresCompanyKnowledge(message: string, intent: string): boolean {
    const normalized = this.normalizeSearchText(`${message} ${intent}`);

    return /\b(menu|plat|plats|repas|produit|produits|article|articles|variant|variante|dish|boisson|boissons|drink|prix|tarif|price|disponib|stock|livraison|livrer|delivery|paiement|payment|commande|order|touslou|twasslou|ncommandi|9addech|soum)\b/.test(
      normalized,
    );
  }

  private isOrderContinuation(message: string): boolean {
    const normalized = this.normalizeSearchText(message);

    return /^(oui|yes|ok|okay|daccord|je confirme|confirme|confirm|ey|eey|ihe|نعم|اي|إي)\b/.test(
      normalized,
    ) || /\b(quantite|quantites|quantity|commande|commandi|confirmation|confirme)\b/.test(
      normalized,
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
      return "Bech nthabetlek m3a l'equipe w narja3lek b ijeba s7i7a.";
    }

    if (
      normalized === 'tunisian_arabic' ||
      normalized === 'ar' ||
      normalized === 'arabic' ||
      normalized.includes('arabic_script')
    ) {
      return '\u0633\u0623\u062a\u062d\u0642\u0642 \u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0629 \u0645\u0639 \u0627\u0644\u0641\u0631\u064a\u0642 \u0648\u0623\u0639\u0648\u062f \u0625\u0644\u064a\u0643 \u0628\u0625\u062c\u0627\u0628\u0629 \u062f\u0642\u064a\u0642\u0629.';
    }

    if (
      normalized === 'en' ||
      normalized.startsWith('en_') ||
      normalized.includes('english')
    ) {
      return "I'll check this information with the team and get back to you with a precise answer.";
    }

    return "Je vais v\u00e9rifier cette information avec l'\u00e9quipe et revenir vers vous avec une r\u00e9ponse pr\u00e9cise.";
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
      return Array.from(
        new Set(
          [
            decision.orderDetails.requestedItem,
            ...decision.orderDetails.items.map((item) => item.name),
            decision.orderDetails.address
              ? `livraison ${decision.orderDetails.address}`
              : 'livraison adresse',
            'commande prix disponibilite confirmation',
            ...decision.keywordsForSearch.slice(0, 4),
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
    const sources = rag.evidences
      .slice(0, 8)
      .map((evidence) => String(evidence.id))
      .filter(Boolean);
    const reply = this.buildRagEvidenceFallbackReply(
      initial.detectedLanguage,
      rag,
    );

    return {
      ...initial,
      needsRag: true,
      canAnswer: sources.length > 0 && reply.length > 0,
      handoffRequired: initial.handoffRequired,
      orderDetails: this.finalizeOrderDetails(initial.orderDetails),
      replyDraft: reply,
      reply,
      sources,
      confidence: Math.max(initial.confidence, rag.confidence),
      reason,
    };
  }

  private buildRagEvidenceFallbackReply(
    language: string,
    rag: RagResultDto,
  ): string {
    const bullets = rag.evidences
      .slice(0, 3)
      .map((evidence) => this.formatEvidenceBullet(evidence))
      .filter(Boolean);

    if (!bullets.length) {
      return this.verificationReply(language);
    }

    const intro = this.evidenceFallbackIntro(language);
    return `${intro}\n${bullets.join('\n')}`.slice(0, 1200);
  }

  private formatEvidenceBullet(evidence: RagResultDto['evidences'][number]): string {
    const title =
      typeof evidence.metadata?.articleTitle === 'string' &&
      evidence.metadata.articleTitle.trim()
        ? `${evidence.metadata.articleTitle.trim()}: `
        : '';
    const snippet = this.evidenceSnippet(evidence.content);

    return snippet ? `- ${title}${snippet}` : '';
  }

  private evidenceSnippet(content: string, maxLength = 420): string {
    const compact = content
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

  private evidenceFallbackIntro(language: string): string {
    const normalized = language.toLowerCase();

    if (
      normalized === 'tunisian_arabic_latin' ||
      normalized.includes('arabizi') ||
      normalized.includes('tounsi_latin')
    ) {
      return 'Hedhi l ma3loumet eli l9ithom:';
    }

    if (
      normalized === 'tunisian_arabic' ||
      normalized === 'ar' ||
      normalized === 'arabic' ||
      normalized.includes('arabic_script')
    ) {
      return '\u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0645\u062a\u0648\u0641\u0631\u0629:';
    }

    if (
      normalized === 'en' ||
      normalized.startsWith('en_') ||
      normalized.includes('english')
    ) {
      return 'Here is the information I found:';
    }

    return 'Voici les informations disponibles :';
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
    const canAnswer = finalDecision.canAnswer && hasGrounding;
    const requiresVerification = !hasGrounding;
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
        : finalDecision.reply,
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
        usedVision: false,
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
    const reply = this.verificationReply(language);

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
      /\b(?:source id|article id|chunk id|metadata|rag|knowledge base|base de connaissances)\b/i.test(
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
    if (!['order', 'purchase'].includes((details.actionType ?? '').toLowerCase())) {
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
        item.subtotal ??
        (item.quantity !== null && item.unitPrice !== null
          ? Number((item.quantity * item.unitPrice).toFixed(2))
          : null),
    }));
    const canCalculateTotal =
      items.length > 0 && items.every((item) => item.subtotal !== null);
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
      total: details.total ?? calculatedTotal,
      currency:
        details.currency ??
        items.find((item) => item.currency)?.currency ??
        null,
      confirmationStatus:
        details.confirmationStatus ??
        (missingFields.length ? 'collecting_details' : null),
      missingFields,
    };
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
