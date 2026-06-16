import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProvider } from './embedding-provider.interface';

type EmbeddingApiResponse = {
  data?: Array<{ index?: number; embedding?: number[] }>;
  error?: { message?: string };
};

@Injectable()
export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly configService: ConfigService) {}

  async generate(
    texts: string[],
    dimensions: number,
    _task: 'document' | 'query',
  ): Promise<number[][]> {
    const endpoint = this.configService.get<string>('EMBEDDING_API_URL')?.trim();
    const apiKey =
      this.configService.get<string>('EMBEDDING_API_KEY')?.trim() ||
      this.configService.get<string>('OPENROUTER_API_KEY')?.trim();
    const model = this.configService.get<string>('EMBEDDING_MODEL')?.trim();

    if (!endpoint || !apiKey || !model) {
      throw new ServiceUnavailableException(
        'Embedding provider is not configured (EMBEDDING_API_URL, EMBEDDING_API_KEY and EMBEDDING_MODEL are required)',
      );
    }

    const response = await this.fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: texts, dimensions }),
    });
    const payload = (await response.json()) as EmbeddingApiResponse;

    if (!response.ok) {
      throw new BadGatewayException(
        payload.error?.message || `Embedding provider returned HTTP ${response.status}`,
      );
    }

    const rows = [...(payload.data ?? [])].sort(
      (left, right) => (left.index ?? 0) - (right.index ?? 0),
    );

    return rows.map((row) => row.embedding ?? []);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const timeoutMs =
      this.configService.get<number>('EMBEDDING_REQUEST_TIMEOUT_MS') ?? 20000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Embedding provider request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
