import { Injectable } from '@nestjs/common';
import { GeminiService } from '../../integrations/gemini/gemini.service';
import { AiReplyRequestDto } from './dto/ai-reply-request.dto';
import { AiReplyResponseDto } from './dto/ai-reply-response.dto';
import { StructuredOutputDto } from './dto/structured-output.dto';
import { AiSafetyRulesService } from './policies/ai-safety-rules.service';
import { EscalationDecisionService } from './policies/escalation-decision.service';
import { HallucinationGuardService } from './policies/hallucination-guard.service';
import { AiMapper } from './mappers/ai.mapper';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
import { buildReplyPrompt } from './prompts/reply.prompt';
import { buildSummarizerPrompt } from './prompts/summarizer.prompt';

@Injectable()
export class AiService {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly aiSafetyRulesService: AiSafetyRulesService,
    private readonly escalationDecisionService: EscalationDecisionService,
    private readonly hallucinationGuardService: HallucinationGuardService,
  ) {}

  async generateReply(payload: AiReplyRequestDto): Promise<AiReplyResponseDto> {
    const safety = this.aiSafetyRulesService.evaluate(payload.message);

    if (!safety.safe) {
      return AiMapper.toReplyResponse({
        reply: '',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        safe: false,
        shouldEscalate: true,
        escalationReason: safety.reason,
        confidence: 0,
        summary: null,
        blockedReason: safety.reason,
      });
    }

    const prompt = buildReplyPrompt({
      message: payload.message,
      contactName: payload.contactName,
      channel: payload.channel,
      history: payload.history,
    });

    const generated = await this.geminiService.generateText({
      prompt,
      systemInstruction: SYSTEM_PROMPT,
      model: 'gemini-2.5-flash',
      temperature: 0.4,
      maxOutputTokens: 400,
    });

    const hallucinationCheck = this.hallucinationGuardService.validateReply(generated.text);

    if (!hallucinationCheck.valid) {
      return AiMapper.toReplyResponse({
        reply: '',
        provider: 'gemini',
        model: generated.model,
        safe: false,
        shouldEscalate: true,
        escalationReason: hallucinationCheck.reason,
        confidence: 0,
        summary: null,
        blockedReason: hallucinationCheck.reason,
      });
    }

    const escalation = this.escalationDecisionService.decide(payload.message, generated.text);
    const summary = payload.history?.length
      ? await this.summarizeConversation(payload.history)
      : null;

    return AiMapper.toReplyResponse({
      reply: generated.text,
      provider: 'gemini',
      model: generated.model,
      safe: true,
      shouldEscalate: escalation.shouldEscalate,
      escalationReason: escalation.reason,
      confidence: escalation.confidence,
      summary,
      blockedReason: null,
      metadata: {
        shadowMode: payload.shadowMode ?? false,
        conversationId: payload.conversationId ?? null,
        contactId: payload.contactId ?? null,
      },
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

  private normalizeJsonText(rawText: string): string {
    const trimmed = rawText.trim();
    const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    return trimmed;
  }
}
