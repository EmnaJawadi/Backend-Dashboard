import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  async generateEmbedding(text: string): Promise<number[]> {
    const normalized = text?.trim();

    if (!normalized) {
      return [];
    }

    // Placeholder logic
    // بعد تنجم تبدلها بـ OpenAI / Ollama / Voyage / autre provider
    const values = normalized
      .slice(0, 256)
      .split('')
      .map((char) => char.charCodeAt(0) / 255);

    return values;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      results.push(embedding);
    }

    this.logger.log(`Generated ${results.length} embeddings`);

    return results;
  }
}