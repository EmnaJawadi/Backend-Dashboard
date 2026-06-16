import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProvider } from './embedding-provider.interface';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider';
import { OpenAiCompatibleEmbeddingProvider } from './openai-compatible-embedding.provider';

@Injectable()
export class EmbeddingsService {
  static readonly DIMENSIONS = 1536;
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly configService: ConfigService = new ConfigService(),
    private readonly openAiProvider: OpenAiCompatibleEmbeddingProvider =
      new OpenAiCompatibleEmbeddingProvider(configService),
    private readonly geminiProvider: GeminiEmbeddingProvider =
      new GeminiEmbeddingProvider(configService),
  ) {}

  async generateEmbedding(text: string): Promise<number[]> {
    const [embedding] = await this.generate([text], 'query');
    return embedding ?? [];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return this.generate(texts, 'document');
  }

  private async generate(
    texts: string[],
    task: 'document' | 'query',
  ): Promise<number[][]> {
    const results = texts.map(() => [] as number[]);
    const nonEmpty = texts
      .map((text, index) => ({ text: text?.trim(), index }))
      .filter((item) => Boolean(item.text));

    if (nonEmpty.length === 0) {
      return results;
    }

    const provider = this.getProvider();
    const batchSize = Math.min(
      Math.max(this.configService.get<number>('EMBEDDING_BATCH_SIZE') ?? 16, 1),
      100,
    );

    for (let offset = 0; offset < nonEmpty.length; offset += batchSize) {
      const batch = nonEmpty.slice(offset, offset + batchSize);
      const embeddings = await provider.generate(
        batch.map((item) => item.text),
        EmbeddingsService.DIMENSIONS,
        task,
      );

      if (embeddings.length !== batch.length) {
        throw new BadGatewayException(
          `Embedding provider ${provider.name} returned ${embeddings.length} vectors for ${batch.length} inputs`,
        );
      }

      embeddings.forEach((embedding, index) => {
        this.assertValidEmbedding(embedding, provider.name);
        results[batch[index].index] = embedding;
      });
    }

    this.logger.log(
      `Generated ${nonEmpty.length} embeddings with provider=${provider.name} dimensions=${EmbeddingsService.DIMENSIONS}`,
    );

    return results;
  }

  private getProvider(): EmbeddingProvider {
    const provider = (
      this.configService.get<string>('EMBEDDING_PROVIDER') ||
      'openai-compatible'
    ).toLowerCase();

    if (provider === 'gemini') {
      return this.geminiProvider;
    }

    if (provider === 'openai-compatible') {
      return this.openAiProvider;
    }

    throw new BadGatewayException(`Unsupported embedding provider: ${provider}`);
  }

  private assertValidEmbedding(values: number[], provider: string): void {
    if (values.length !== EmbeddingsService.DIMENSIONS) {
      throw new BadGatewayException(
        `Embedding provider ${provider} returned ${values.length} dimensions; expected ${EmbeddingsService.DIMENSIONS}`,
      );
    }

    if (values.some((value) => !Number.isFinite(value))) {
      throw new BadGatewayException(
        `Embedding provider ${provider} returned non-finite values`,
      );
    }
  }
}
