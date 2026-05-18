import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GeminiChatInput,
  GeminiChatOutput,
  GeminiImageUnderstandingInput,
  GeminiGenerateTextInput,
  GeminiGenerateTextOutput,
  GeminiUsage,
} from './gemini.types';

type GoogleGenAIInstance = {
  models: {
    generateContent: (params: {
      model: string;
      config?: {
        systemInstruction?: string;
        temperature?: number;
        maxOutputTokens?: number;
      };
      contents: unknown;
    }) => Promise<{
      text?: string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }>;
  };
};

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAIInstance | null = null;
  private readonly defaultModel: string;
  private readonly apiKey: string | null;
  private readonly apiKeySource: string | null;

  constructor(private readonly configService: ConfigService) {
    this.defaultModel =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
    const resolvedApiKey = this.resolveApiKey();
    this.apiKey = resolvedApiKey.value;
    this.apiKeySource = resolvedApiKey.source;
    this.logger.log(
      `Gemini API key configured: ${this.apiKey ? 'yes' : 'no'} source=${this.apiKeySource ?? 'none'}`,
    );
  }

  private async getClient(): Promise<GoogleGenAIInstance> {
    if (this.client) {
      return this.client;
    }

    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'Gemini API key is not defined. Checked GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, and GOOGLE_API_KEY.',
      );
    }

    try {
      const mod = await import('@google/genai');
      this.client = new mod.GoogleGenAI({
        apiKey: this.apiKey,
      }) as GoogleGenAIInstance;
      return this.client;
    } catch (error) {
      this.logger.error(
        `Failed to initialize Gemini client: ${this.getSafeErrorMessage(error)}`,
      );
      throw new InternalServerErrorException('Failed to initialize Gemini client');
    }
  }

  async generateText(
    input: GeminiGenerateTextInput,
  ): Promise<GeminiGenerateTextOutput> {
    try {
      const client = await this.getClient();
      const model = input.model || this.defaultModel;

      const response = await client.models.generateContent({
        model,
        config: {
          ...(input.systemInstruction
            ? { systemInstruction: input.systemInstruction }
            : {}),
          ...(typeof input.temperature === 'number'
            ? { temperature: input.temperature }
            : {}),
          ...(typeof input.maxOutputTokens === 'number'
            ? { maxOutputTokens: input.maxOutputTokens }
            : {}),
        },
        contents: input.prompt,
      });

      return {
        text: response.text?.trim() || '',
        model,
        usage: this.extractUsage(response.usageMetadata),
      };
    } catch (error) {
      this.logger.error(
        `Gemini generateText failed: ${this.getSafeErrorMessage(error)}`,
      );
      throw new InternalServerErrorException('Failed to generate text with Gemini');
    }
  }

  async generateImageUnderstanding(
    input: GeminiImageUnderstandingInput,
  ): Promise<GeminiGenerateTextOutput> {
    try {
      const client = await this.getClient();
      const model = input.model || this.defaultModel;
      const imagePart = input.data
        ? {
            inlineData: {
              mimeType: input.mimeType,
              data: input.data,
            },
          }
        : input.mediaUrl
          ? {
              fileData: {
                mimeType: input.mimeType,
                fileUri: input.mediaUrl,
              },
            }
          : null;

      if (!imagePart) {
        throw new InternalServerErrorException('No image data was provided');
      }

      const response = await client.models.generateContent({
        model,
        config: {
          systemInstruction:
            input.systemInstruction ??
            'You are a careful customer-support image understanding assistant. Return JSON only.',
          ...(typeof input.temperature === 'number'
            ? { temperature: input.temperature }
            : { temperature: 0.1 }),
          ...(typeof input.maxOutputTokens === 'number'
            ? { maxOutputTokens: input.maxOutputTokens }
            : { maxOutputTokens: 300 }),
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: input.prompt }, imagePart],
          },
        ],
      });

      return {
        text: response.text?.trim() || '',
        model,
        usage: this.extractUsage(response.usageMetadata),
      };
    } catch (error) {
      this.logger.error(
        `Gemini image understanding failed: ${this.getSafeErrorMessage(error)}`,
      );
      throw new InternalServerErrorException(
        'Failed to understand image with Gemini',
      );
    }
  }

  async chat(input: GeminiChatInput): Promise<GeminiChatOutput> {
    try {
      const client = await this.getClient();
      const model = input.model || this.defaultModel;

      const contents = input.messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

      const response = await client.models.generateContent({
        model,
        config: {
          ...(input.systemInstruction
            ? { systemInstruction: input.systemInstruction }
            : {}),
          ...(typeof input.temperature === 'number'
            ? { temperature: input.temperature }
            : {}),
          ...(typeof input.maxOutputTokens === 'number'
            ? { maxOutputTokens: input.maxOutputTokens }
            : {}),
        },
        contents,
      });

      return {
        text: response.text?.trim() || '',
        model,
        usage: this.extractUsage(response.usageMetadata),
      };
    } catch (error) {
      this.logger.error(
        `Gemini chat failed: ${this.getSafeErrorMessage(error)}`,
      );
      throw new InternalServerErrorException('Failed to chat with Gemini');
    }
  }

  private resolveApiKey(): { value: string | null; source: string | null } {
    const candidates: Array<{ source: string; value?: string }> = [
      {
        source: 'GEMINI_API_KEY',
        value: this.configService.get<string>('GEMINI_API_KEY'),
      },
      {
        source: 'GOOGLE_GENERATIVE_AI_API_KEY',
        value: this.configService.get<string>('GOOGLE_GENERATIVE_AI_API_KEY'),
      },
      {
        source: 'GOOGLE_API_KEY',
        value: this.configService.get<string>('GOOGLE_API_KEY'),
      },
    ];

    const match = candidates.find((candidate) => candidate.value?.trim());

    return {
      value: match?.value?.trim() ?? null,
      source: match?.source ?? null,
    };
  }

  private getSafeErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected Gemini error';
  }

  private extractUsage(
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    },
  ): GeminiUsage | undefined {
    if (!usageMetadata) {
      return undefined;
    }

    return {
      promptTokens: usageMetadata.promptTokenCount ?? null,
      completionTokens: usageMetadata.candidatesTokenCount ?? null,
      totalTokens: usageMetadata.totalTokenCount ?? null,
    };
  }
}
