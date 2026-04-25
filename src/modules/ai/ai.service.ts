import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { GeminiService } from '../../integrations/gemini/gemini.service';
import { AiRunsRepository } from '../ai-runs/ai-runs.repository';
import { RagService } from '../rag/rag.service';
import {
  ConversationWindowService,
  ConversationWindowStatus,
} from '../whatsapp/policies/conversation-window.service';
import { AiReplyRequestDto } from './dto/ai-reply-request.dto';
import { AiReplyResponseDto } from './dto/ai-reply-response.dto';
import { StructuredOutputDto } from './dto/structured-output.dto';
import { AiSafetyRulesService } from './policies/ai-safety-rules.service';
import { EscalationDecisionService } from './policies/escalation-decision.service';
import { HallucinationGuardService } from './policies/hallucination-guard.service';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
import { buildStructuredReplyPrompt } from './prompts/reply.prompt';
import { buildSummarizerPrompt } from './prompts/summarizer.prompt';

type AiIntent =
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

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly ragService: RagService,
    private readonly aiRunsRepository: AiRunsRepository,
    private readonly conversationWindowService: ConversationWindowService,
    private readonly aiSafetyRulesService: AiSafetyRulesService,
    private readonly escalationDecisionService: EscalationDecisionService,
    private readonly hallucinationGuardService: HallucinationGuardService,
  ) {}

  async generateReply(payload: AiReplyRequestDto): Promise<AiReplyResponseDto> {
    const startedAt = Date.now();
    const message = payload.message?.trim() ?? '';
    const conversation = payload.conversationId
      ? await this.getConversationContext(payload.conversationId)
      : null;
    const history = this.buildHistory(payload, conversation);
    const windowStatus = this.conversationWindowService.checkWindow(
      conversation?.lastCustomerMessageAt ??
        payload.lastCustomerMessageAt ??
        null,
    );

    if (
      (payload.direction && payload.direction !== 'inbound') ||
      payload.messageType === 'system' ||
      payload.messageType === 'notification'
    ) {
      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        windowStatus,
        response: this.buildBaseResponse({
          intent: 'unknown',
          answer: '',
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: 0,
          reason: 'NON_INBOUND_MESSAGE',
          action: 'ignored',
          sources: [],
          tagsToApply: [],
          windowStatus,
          metadata: { ignored: true },
        }),
      });
    }

    if (!message) {
      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        windowStatus,
        response: this.buildBaseResponse({
          intent: 'unknown',
          answer: '',
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: 0,
          reason: 'EMPTY_INBOUND_MESSAGE',
          action: 'ignored',
          sources: [],
          tagsToApply: [],
          windowStatus,
          metadata: { ignored: true },
        }),
      });
    }

    if (conversation?.botPaused === true) {
      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        windowStatus,
        response: this.buildBaseResponse({
          intent: this.detectIntent(message),
          answer: '',
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: 0,
          reason: 'BOT_PAUSED',
          action: 'skipped',
          sources: [],
          tagsToApply: [],
          windowStatus,
          metadata: { botPaused: true },
        }),
      });
    }

    if (this.hasHumanTakeover(conversation)) {
      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        windowStatus,
        response: this.buildBaseResponse({
          intent: this.detectIntent(message),
          answer: '',
          safe: true,
          handoffRequired: false,
          needsClarification: false,
          confidence: 0,
          reason: 'HUMAN_TAKEOVER_ACTIVE',
          action: 'skipped',
          sources: [],
          tagsToApply: [],
          windowStatus,
          metadata: { humanTakeoverActive: true },
        }),
      });
    }

    const safety = this.aiSafetyRulesService.evaluate(message);
    const sensitive = !safety.safe || this.detectSensitiveRisk(message);

    if (!safety.safe) {
      const response = this.buildBaseResponse({
        intent: this.detectIntent(message),
        answer:
          'Je vais transférer cette demande à un agent humain pour la traiter en toute sécurité.',
        safe: false,
        handoffRequired: true,
        needsClarification: false,
        confidence: 0.2,
        reason: 'SENSITIVE_INFORMATION_DETECTED',
        action: 'handoff',
        sources: [],
        tagsToApply: ['sensitive', 'handoff'],
        windowStatus,
        blockedReason: safety.reason,
      });

      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        windowStatus,
        response,
      });
    }

    const ambiguity = this.detectAmbiguity(message, history);

    if (ambiguity) {
      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        windowStatus,
        response: this.buildBaseResponse({
          intent: this.detectIntent(message),
          answer:
            'Pouvez-vous préciser votre demande pour que je vous réponde correctement ?',
          safe: true,
          handoffRequired: false,
          needsClarification: true,
          confidence: 0.35,
          reason: 'NEEDS_CLARIFICATION',
          action: 'clarify',
          sources: [],
          tagsToApply: ['clarification'],
          windowStatus,
        }),
      });
    }

    const rag = await this.ragService.query({
      query: message,
      history,
      language: conversation?.contact.language ?? undefined,
      companyId: conversation?.companyId ?? payload.companyId,
    });

    if (!rag.hasReliableSources) {
      const response = this.buildBaseResponse({
        intent: this.detectIntent(message),
        answer:
          'Je n’ai pas trouvé d’information fiable dans la base de connaissances pour répondre avec certitude. Je transfère la demande à un agent.',
        safe: true,
        handoffRequired: true,
        needsClarification: false,
        confidence: 0.25,
        reason: 'KB_NO_RELIABLE_SOURCE',
        action: 'handoff',
        sources: [],
        tagsToApply: ['kb_missing', 'handoff'],
        windowStatus,
        metadata: {
          ragConfidence: rag.confidence,
        },
      });

      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        windowStatus,
        response,
      });
    }

    const prompt = buildStructuredReplyPrompt({
      message,
      contactName:
        payload.contactName ??
        conversation?.contact.fullName ??
        conversation?.contact.whatsappName ??
        undefined,
      channel: payload.channel,
      history,
      evidenceContext: rag.context,
      allowedSourceIds: rag.sources,
      needsClarification: false,
      sensitive,
    });

    const generated = await this.geminiService.generateText({
      prompt,
      systemInstruction: SYSTEM_PROMPT,
      model: 'gemini-2.5-flash',
      temperature: 0.1,
      maxOutputTokens: 600,
    });

    const parsed = this.parseAgentJson(generated.text);

    if (!parsed) {
      const response = this.buildBaseResponse({
        intent: this.detectIntent(message),
        answer:
          'Je préfère transférer cette demande à un agent afin d’éviter une réponse incorrecte.',
        safe: true,
        handoffRequired: true,
        needsClarification: false,
        confidence: 0.2,
        reason: 'INVALID_AI_JSON',
        action: 'handoff',
        sources: rag.sources,
        tagsToApply: ['ai_invalid_json', 'handoff'],
        windowStatus,
        metadata: { rawGeminiText: generated.text },
      });

      await this.prepareHandoff(conversation, response.reason);

      return this.finalizeResponse({
        payload,
        conversation,
        startedAt,
        windowStatus,
        response,
        usage: this.resolveUsage(generated.usage, prompt, response.answer),
      });
    }

    const safeSources = this.keepAllowedSources(parsed.sources ?? [], rag.sources);
    const hallucinationCheck = this.hallucinationGuardService.validateReply(
      parsed.answer ?? '',
    );
    const escalation = this.escalationDecisionService.decide(
      message,
      parsed.answer ?? '',
    );
    const confidence = this.normalizeConfidence(
      parsed.confidence,
      rag.confidence,
    );
    const handoffRequired =
      Boolean(parsed.handoffRequired) ||
      escalation.shouldEscalate ||
      sensitive ||
      !hallucinationCheck.valid ||
      confidence < 0.45;

    const response = this.buildBaseResponse({
      intent: this.normalizeIntent(parsed.intent),
      answer:
        parsed.answer?.trim() ||
        'Je préfère transférer cette demande à un agent afin d’éviter une réponse incorrecte.',
      safe: hallucinationCheck.valid,
      handoffRequired,
      needsClarification: Boolean(parsed.needsClarification),
      confidence,
      reason:
        !hallucinationCheck.valid
          ? hallucinationCheck.reason
          : escalation.reason ?? parsed.reason ?? null,
      action: this.resolveAction({
        handoffRequired,
        needsClarification: Boolean(parsed.needsClarification),
        windowStatus,
      }),
      sources: safeSources.length > 0 ? safeSources : rag.sources.slice(0, 1),
      tagsToApply: this.normalizeTags(parsed.tagsToApply, {
        addHandoff: handoffRequired,
      }),
      windowStatus,
      metadata: {
        ragConfidence: rag.confidence,
        ragSources: rag.sources,
        rawGeminiText: generated.text,
      },
    });

    if (response.handoffRequired) {
      await this.prepareHandoff(conversation, response.reason);
    }

    return this.finalizeResponse({
      payload,
      conversation,
      startedAt,
      windowStatus,
      response,
      usage: this.resolveUsage(generated.usage, prompt, response.answer),
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

  private async getConversationContext(
    conversationId: string,
  ): Promise<ConversationContext | null> {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        companyId: true,
        status: true,
        assignedTo: true,
        botPaused: true,
        handoffRequired: true,
        lastCustomerMessageAt: true,
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
    windowStatus: ConversationWindowStatus;
    blockedReason?: string | null;
    metadata?: Record<string, unknown>;
  }): AiReplyResponseDto {
    return new AiReplyResponseDto({
      intent: params.intent,
      answer: params.answer,
      reply: params.answer,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      safe: params.safe,
      canSendFreeForm: params.windowStatus.canSendFreeForm,
      handoffRequired: params.handoffRequired,
      needsClarification: params.needsClarification,
      reason:
        params.reason,
      sources: params.sources,
      tagsToApply: params.tagsToApply,
      shouldEscalate: params.handoffRequired,
      escalationReason: params.handoffRequired ? params.reason : null,
      confidence: params.confidence,
      summary: null,
      blockedReason: params.blockedReason ?? null,
      action: params.action,
      metadata: {
        ...(params.metadata ?? {}),
        window: this.serializeWindow(params.windowStatus),
      },
    });
  }

  private async finalizeResponse(params: {
    payload: AiReplyRequestDto;
    conversation: ConversationContext | null;
    startedAt: number;
    windowStatus: ConversationWindowStatus;
    response: AiReplyResponseDto;
    usage?: UsageSnapshot;
  }): Promise<AiReplyResponseDto> {
    const usage =
      params.usage ??
      this.resolveUsage(
        undefined,
        params.payload.message,
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
      prompt: params.payload.message,
      response: params.response.answer,
      intent: params.response.intent,
      provider: 'gemini',
      model: params.response.model,
      status: params.response.action === 'ignored' ? 'blocked' : 'success',
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
          confidence: params.response.confidence,
          handoffRequired: params.response.handoffRequired,
          needsClarification: params.response.needsClarification,
          canSendFreeForm: params.response.canSendFreeForm,
          reason: params.response.reason,
          sources: params.response.sources,
          tagsToApply: params.response.tagsToApply,
          action: params.response.action,
        },
        usage,
        metadata: params.response.metadata ?? {},
      },
    });

    params.response.aiRunId = aiRun.id;
    params.response.metadata = {
      ...(params.response.metadata ?? {}),
      aiRunId: aiRun.id,
      latencyMs: Date.now() - params.startedAt,
      usage,
    };

    return params.response;
  }

  private async prepareHandoff(
    conversation: ConversationContext | null,
    reason: string | null,
  ) {
    if (!conversation) {
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'human_assigned',
        handoffRequired: true,
        botPaused: true,
        updatedAt: new Date(),
      },
    });

    conversation.status = 'human_assigned';
    conversation.handoffRequired = true;
    conversation.botPaused = true;
    void reason;
  }

  private hasHumanTakeover(conversation: ConversationContext | null): boolean {
    if (!conversation) {
      return false;
    }

    return (
      conversation.handoffRequired === true ||
      conversation.status === 'human_assigned' ||
      Boolean(conversation.assignedTo)
    );
  }

  private detectAmbiguity(
    message: string,
    history: Array<{ role: string; content: string }>,
  ): boolean {
    const normalized = message.toLowerCase().trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const vagueOnly = /^(ca|ça|cela|ceci|oui|non|ok|d'accord|prix|tarif)\??$/i;

    return (
      (words.length <= 2 && history.length <= 1) ||
      vagueOnly.test(normalized)
    );
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
      /agent humain/i,
      /human agent/i,
    ].some((pattern) => pattern.test(message));
  }

  private detectIntent(message: string): AiIntent {
    const text = message.toLowerCase();

    if (/prix|tarif|pricing|abonnement|plan/.test(text)) return 'pricing';
    if (/refund|remboursement|retour/.test(text)) return 'refund';
    if (/bug|erreur|panne|marche pas|support/.test(text)) {
      return 'technical_support';
    }
    if (/commande|livraison|order|delivery|statut/.test(text)) {
      return 'order_status';
    }
    if (/plainte|complaint|colere|fache|angry/.test(text)) {
      return 'complaint';
    }
    if (/bonjour|salut|hello|hi/.test(text)) return 'greeting';

    return 'other';
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

  private normalizeJsonText(rawText: string): string {
    const trimmed = rawText.trim();
    const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    return trimmed;
  }

  private normalizeIntent(intent?: string): AiIntent {
    const value = intent?.trim().toLowerCase();
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

    return allowed.includes(value as AiIntent) ? (value as AiIntent) : 'other';
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

  private resolveAction(params: {
    handoffRequired: boolean;
    needsClarification: boolean;
    windowStatus: ConversationWindowStatus;
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

  private serializeWindow(windowStatus: ConversationWindowStatus) {
    return {
      isWithinWindow: windowStatus.isWithinWindow,
      canSendFreeForm: windowStatus.canSendFreeForm,
      reason: windowStatus.reason,
      remainingHours: windowStatus.remainingHours,
      expiresAt: windowStatus.expiresAt?.toISOString() ?? null,
      lastCustomerMessageAt:
        windowStatus.lastCustomerMessageAt?.toISOString() ?? null,
      windowHours: windowStatus.windowHours,
    };
  }
}
