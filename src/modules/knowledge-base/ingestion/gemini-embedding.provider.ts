import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProvider } from './embedding-provider.interface';

type GeminiEmbeddingResponse = {
  embeddings?: Array<{ values?: number[] }>;
  error?: { message?: string };
};

@Injectable()
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';

  constructor(private readonly configService: ConfigService) {}

  async generate(
    texts: string[],
    dimensions: number,
    task: 'document' | 'query',
  ): Promise<number[][]> {
    const apiKey =
      this.configService.get<string>('EMBEDDING_API_KEY')?.trim() ||
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ||
      this.configService.get<string>('GOOGLE_API_KEY')?.trim();
    const model =
      this.configService.get<string>('EMBEDDING_MODEL')?.trim() ||
      'gemini-embedding-001';

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Gemini embedding provider is not configured (EMBEDDING_API_KEY or GEMINI_API_KEY is required)',
      );
    }

    const modelPath = model.startsWith('models/') ? model : `models/${model}`;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeoutMs =
      this.configService.get<number>('EMBEDDING_REQUEST_TIMEOUT_MS') ?? 20000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: modelPath,
            content: { parts: [{ text }] },
            taskType:
              task === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
            outputDimensionality: dimensions,
          })),
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as GeminiEmbeddingResponse;

      if (!response.ok) {
        throw new BadGatewayException(
          payload.error?.message || `Gemini embeddings returned HTTP ${response.status}`,
        );
      }

      return (payload.embeddings ?? []).map((row) => row.values ?? []);
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        `Gemini embedding request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
