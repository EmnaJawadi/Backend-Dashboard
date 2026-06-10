import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

export type AiProviderName = 'openrouter' | 'ollama' | 'gemini';

export type AiProviderFailureReason =
  | 'quota_exceeded'
  | 'invalid_api_key'
  | 'timeout'
  | 'network_error'
  | 'empty_response'
  | 'provider_error';

export type AiConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type GenerateAnswerInput = {
  systemPrompt: string;
  userMessage: string;
  context?: string;
  conversationHistory?: AiConversationMessage[];
  companyId?: string | null;
  instanceName?: string | null;
  language?: string | null;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
};

export type AiProviderUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type AiProviderAttempt = {
  provider: AiProviderName;
  model: string;
  success: boolean;
  latencyMs: number;
  errorMessage?: string;
  errorReason?: AiProviderFailureReason;
};

export type AiProviderAnswer = {
  text: string;
  provider: AiProviderName;
  model: string;
  usage?: AiProviderUsage;
  fallbackUsed: boolean;
  errorMessage?: string;
  attempts: AiProviderAttempt[];
  rawResponse?: Record<string, unknown>;
};

type ProviderExecution = Omit<AiProviderAnswer, 'fallbackUsed' | 'attempts'>;

export class AiProviderGenerationError extends Error {
  constructor(
    message: string,
    readonly attempts: AiProviderAttempt[],
    readonly fallbackUsed: boolean,
  ) {
    super(message);
    this.name = AiProviderGenerationError.name;
  }
}

class EmptyAiProviderResponseError extends Error {
  constructor(provider: AiProviderName) {
    super(`${provider} returned an empty response.`);
    this.name = EmptyAiProviderResponseError.name;
  }
}

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly timeoutMs: number;
  private readonly maxContextChars: number;
  private readonly fallbackOrder: AiProviderName[] = [
    'openrouter',
    'gemini',
    'ollama',
  ];

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.positiveInteger('AI_REQUEST_TIMEOUT_MS', 45000);
    this.maxContextChars = this.positiveInteger('AI_MAX_CONTEXT_CHARS', 6000);
  }

  getConfiguredProvider(): AiProviderName {
    return this.fallbackOrder[0];
  }

  async generateAnswer(input: GenerateAnswerInput): Promise<AiProviderAnswer> {
    return this.generateWithFallback(input);
  }

  async generateWithFallback(
    input: GenerateAnswerInput,
  ): Promise<AiProviderAnswer> {
    const attempts: AiProviderAttempt[] = [];
    const failedMessages: string[] = [];

    for (const provider of this.fallbackOrder) {
      try {
        const response = await this.runAttempt(provider, input, attempts);
        const fallbackUsed = provider !== this.fallbackOrder[0];
        const errorMessage = failedMessages.length
          ? failedMessages.join('; ')
          : undefined;

        this.logger.log(
          `AI_PROVIDER_SELECTED provider=${response.provider} model=${response.model} fallbackUsed=${fallbackUsed} attempts=${attempts.length} companyId=${input.companyId ?? 'null'} instanceName=${input.instanceName ?? 'null'}`,
        );

        return {
          ...response,
          fallbackUsed,
          errorMessage,
          attempts,
        };
      } catch (error) {
        const attempt = attempts[attempts.length - 1];
        const message = `${provider}: ${attempt?.errorMessage ?? this.errorMessage(error)}`;
        failedMessages.push(message);

        const nextProvider = this.fallbackOrder[this.fallbackOrder.indexOf(provider) + 1];
        if (nextProvider) {
          this.logger.warn(
            `AI_PROVIDER_FALLBACK from=${provider} to=${nextProvider} reason=${attempt?.errorReason ?? this.classifyError(error)} companyId=${input.companyId ?? 'null'} instanceName=${input.instanceName ?? 'null'} error=${attempt?.errorMessage ?? this.errorMessage(error)}`,
          );
        }
      }
    }

    throw new AiProviderGenerationError(
      failedMessages.join('; ') || 'all_ai_providers_failed',
      attempts,
      attempts.length > 1,
    );
  }

  protected async executeProvider(
    provider: AiProviderName,
    input: GenerateAnswerInput,
  ): Promise<ProviderExecution> {
    const prompt = this.buildPrompt(input);
    const model = this.modelFor(provider);
    const languageModel =
      provider === 'openrouter'
        ? createOpenRouter({
            apiKey: this.requiredValue('OPENROUTER_API_KEY'),
            compatibility: 'strict',
          }).chat(model)
        : provider === 'ollama'
          ? createOpenAICompatible({
              name: 'ollama',
              baseURL: this.ollamaBaseUrl(),
              apiKey:
                this.configService.get<string>('OLLAMA_API_KEY')?.trim() ||
                'ollama',
            }).chatModel(model)
          : createGoogleGenerativeAI({
              apiKey: this.geminiApiKey(),
            }).languageModel(model);

    const response = await generateText({
      model: languageModel,
      system: input.systemPrompt,
      prompt,
      temperature: input.temperature,
      maxOutputTokens: input.maxOutputTokens,
      maxRetries: 0,
      timeout: this.timeoutMs,
    });

    return {
      text: response.text.trim(),
      provider,
      model,
      usage: {
        promptTokens: response.usage.inputTokens ?? null,
        completionTokens: response.usage.outputTokens ?? null,
        totalTokens: response.usage.totalTokens ?? null,
      },
      rawResponse: {
        finishReason: response.finishReason,
        providerMetadata: response.providerMetadata ?? null,
      },
    };
  }

  private async runAttempt(
    provider: AiProviderName,
    input: GenerateAnswerInput,
    attempts: AiProviderAttempt[],
  ): Promise<ProviderExecution> {
    const startedAt = Date.now();
    const model = this.modelFor(provider);

    try {
      const response = await this.executeProvider(provider, input);
      if (!response.text.trim()) {
        throw new EmptyAiProviderResponseError(provider);
      }

      attempts.push({
        provider,
        model: response.model,
        success: true,
        latencyMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      const message = this.errorMessage(error);
      attempts.push({
        provider,
        model,
        success: false,
        latencyMs: Date.now() - startedAt,
        errorMessage: message,
        errorReason: this.classifyError(error, message),
      });
      this.logger.warn(
        `AI_PROVIDER_ATTEMPT_FAILED provider=${provider} model=${model} reason=${this.classifyError(error, message)} companyId=${input.companyId ?? 'null'} instanceName=${input.instanceName ?? 'null'} error=${message}`,
      );
      throw error;
    }
  }

  private buildPrompt(input: GenerateAnswerInput): string {
    const context = input.context?.trim().slice(0, this.maxContextChars);
    const history = (input.conversationHistory ?? [])
      .slice(-10)
      .map((message) => `${message.role.toUpperCase()}: ${message.content.trim()}`)
      .filter((message) => !message.endsWith(':'))
      .join('\n');

    return [
      input.language?.trim()
        ? `Preferred reply language when appropriate: ${input.language.trim()}`
        : '',
      context ? `Scoped company knowledge context:\n${context}` : '',
      history ? `Recent conversation:\n${history}` : '',
      input.userMessage.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private modelFor(provider: AiProviderName): string {
    if (provider === 'openrouter') {
      return (
        this.configService.get<string>('OPENROUTER_MODEL')?.trim() ||
        'openrouter/free'
      );
    }

    if (provider === 'ollama') {
      return (
        this.configService.get<string>('OLLAMA_MODEL')?.trim() ||
        'llama3.1:latest'
      );
    }

    return (
      this.configService.get<string>('GEMINI_MODEL')?.trim() ||
      'gemini-2.5-flash'
    );
  }

  private requiredValue(key: string): string {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new Error(`${key} is required for the selected AI provider.`);
    }

    return value;
  }

  private geminiApiKey(): string {
    for (const key of [
      'GEMINI_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
      'GOOGLE_API_KEY',
    ]) {
      const value = this.configService.get<string>(key)?.trim();
      if (value) {
        return value;
      }
    }

    throw new Error('GEMINI_API_KEY is required for the selected AI provider.');
  }

  private positiveInteger(key: string, fallback: number): number {
    const value = Number(this.configService.get<string | number>(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private ollamaBaseUrl(): string {
    const value =
      this.configService.get<string>('OLLAMA_BASE_URL')?.trim() ||
      'http://localhost:11434/v1';
    const withoutTrailingSlash = value.replace(/\/+$/, '');

    return withoutTrailingSlash.endsWith('/v1')
      ? withoutTrailingSlash
      : `${withoutTrailingSlash}/v1`;
  }

  private classifyError(
    error: unknown,
    fallbackMessage?: string,
  ): AiProviderFailureReason {
    const status = this.errorStatus(error);
    const message = (fallbackMessage ?? this.errorMessage(error)).toLowerCase();

    if (error instanceof EmptyAiProviderResponseError) {
      return 'empty_response';
    }

    if (
      status === 401 ||
      status === 403 ||
      /\b(api key|api_key|apikey|key is required|unauthorized|forbidden|invalid key|invalid_api_key|permission_denied|authentication)\b/.test(
        message,
      )
    ) {
      return 'invalid_api_key';
    }

    if (
      status === 429 ||
      /\b(429|quota|rate limit|rate_limit|resource_exhausted|too many requests|insufficient_quota)\b/.test(
        message,
      )
    ) {
      return 'quota_exceeded';
    }

    if (/\b(timeout|timed out|abort|aborted|etimedout)\b/.test(message)) {
      return 'timeout';
    }

    if (
      /\b(network|fetch failed|econnrefused|econnreset|enotfound|eai_again|socket hang up)\b/.test(
        message,
      )
    ) {
      return 'network_error';
    }

    if (/\b(empty response|returned an empty response)\b/.test(message)) {
      return 'empty_response';
    }

    return 'provider_error';
  }

  private errorStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const record = error as Record<string, unknown>;
    const response =
      record.response && typeof record.response === 'object'
        ? (record.response as Record<string, unknown>)
        : null;
    const status = record.status ?? record.statusCode ?? response?.status;

    return typeof status === 'number' ? status : undefined;
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : 'unknown_ai_provider_error')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
  }
}
