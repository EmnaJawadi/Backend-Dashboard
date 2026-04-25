import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  Retriever,
  RetrieverOptions,
  RetrieverResult,
} from './retriever.interface';

type RawKbChunk = {
  id: string;
  articleId: string;
  chunkIndex: number;
  chunkText: string | null;
  metadataJson: Prisma.JsonValue | null;
  article: {
    title: string | null;
    language: string | null;
    status: string;
    sourceUrl: string | null;
  };
};

@Injectable()
export class PgvectorRetriever implements Retriever {
  constructor(private readonly prisma: PrismaService) {}

  async retrieve(
    query: string,
    topK: number,
    options?: RetrieverOptions,
  ): Promise<RetrieverResult[]> {
    const tokens = this.tokenize(query);

    if (tokens.length === 0) {
      return [];
    }

    const chunks = await this.prisma.kbChunk.findMany({
      where: this.buildWhere(options),
      take: Math.max(topK * 10, 30),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        articleId: true,
        chunkIndex: true,
        chunkText: true,
        metadataJson: true,
        article: {
          select: {
            title: true,
            language: true,
            status: true,
            sourceUrl: true,
          },
        },
      },
    });

    return chunks
      .map((chunk) => this.scoreChunk(chunk as RawKbChunk, tokens, query))
      .filter((result) => (result.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, topK);
  }

  private buildWhere(options?: RetrieverOptions): Prisma.KbChunkWhereInput {
    const andFilters: Prisma.KbChunkWhereInput[] = [
      { chunkText: { not: null } },
      {
        article: {
          status: 'published',
        },
      },
    ];

    if (options?.language?.trim()) {
      andFilters.push({
        article: {
          language: options.language.trim(),
        },
      });
    }

    if (options?.companyId?.trim()) {
      const companyId = options.companyId.trim();
      andFilters.push({
        OR: [
          { companyId },
          { article: { companyId } },
          {
            AND: [{ companyId: null }, { article: { companyId: null } }],
          },
        ],
      });
    }

    return { AND: andFilters };
  }

  private scoreChunk(
    chunk: RawKbChunk,
    queryTokens: string[],
    query: string,
  ): RetrieverResult {
    const content = chunk.chunkText ?? '';
    const searchable = this.normalize(`${chunk.article.title ?? ''} ${content}`);
    const queryPhrase = this.normalize(query);
    const matchedTokens = queryTokens.filter((token) =>
      searchable.includes(token),
    );

    const tokenScore = matchedTokens.length / queryTokens.length;
    const phraseBonus =
      queryPhrase.length >= 12 && searchable.includes(queryPhrase) ? 0.3 : 0;
    const titleBonus = matchedTokens.some((token) =>
      this.normalize(chunk.article.title ?? '').includes(token),
    )
      ? 0.12
      : 0;
    const score = Number(
      Math.min(1, tokenScore + phraseBonus + titleBonus).toFixed(3),
    );

    return {
      content,
      score,
      metadata: {
        id: chunk.id,
        chunkId: chunk.id,
        articleId: chunk.articleId,
        articleTitle: chunk.article.title,
        chunkIndex: chunk.chunkIndex,
        language: chunk.article.language,
        sourceUrl: chunk.article.sourceUrl,
        metadata: chunk.metadataJson,
        matchedTokens,
      },
    };
  }

  private tokenize(value: string): string[] {
    const stopWords = new Set([
      'avec',
      'dans',
      'des',
      'est',
      'for',
      'les',
      'que',
      'the',
      'une',
      'vous',
      'votre',
    ]);

    return Array.from(
      new Set(
        this.normalize(value)
          .split(/[^a-z0-9]+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 3 && !stopWords.has(token)),
      ),
    );
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
