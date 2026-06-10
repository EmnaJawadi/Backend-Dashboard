import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly dimensions = 1536;

  async generateEmbedding(text: string): Promise<number[]> {
    const normalized = text?.trim();

    if (!normalized) {
      return [];
    }

    // Deterministic local embedding fallback. It keeps the pgvector pipeline live
    // and can be replaced by Gemini embeddings without changing callers.
    const values = Array.from({ length: this.dimensions }, () => 0);
    const tokens = this.tokenize(normalized);

    for (const token of tokens) {
      const index = this.hashToken(token) % this.dimensions;
      values[index] += 1;
    }

    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

    return norm > 0 ? values.map((value) => Number((value / norm).toFixed(6))) : values;
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

  private tokenize(value: string): string[] {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
  }

  private hashToken(token: string): number {
    let hash = 2166136261;

    for (let index = 0; index < token.length; index++) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }
}
