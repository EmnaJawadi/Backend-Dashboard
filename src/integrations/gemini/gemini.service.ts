import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GeminiChatInput,
  GeminiChatOutput,
  GeminiGenerateTextInput,
  GeminiGenerateTextOutput,
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
    }) => Promise<{ text?: string }>;
  };
};

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAIInstance | null = null;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    this.defaultModel =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
  }

  private async getClient(): Promise<GoogleGenAIInstance> {
    if (this.client) {
      return this.client;
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException('GEMINI_API_KEY is not defined');
    }

    try {
      const mod = await import('@google/genai');
      this.client = new mod.GoogleGenAI({ apiKey }) as GoogleGenAIInstance;
      return this.client;
    } catch (error) {
      this.logger.error('Failed to initialize Gemini client', error);
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
      };
    } catch (error) {
      this.logger.error('Gemini generateText failed', error);
      throw new InternalServerErrorException('Failed to generate text with Gemini');
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
      };
    } catch (error) {
      this.logger.error('Gemini chat failed', error);
      throw new InternalServerErrorException('Failed to chat with Gemini');
    }
  }
}
