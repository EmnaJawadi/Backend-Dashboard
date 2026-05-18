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
  companyId: string | null;
  articleId: string;
  chunkIndex: number;
  chunkText: string | null;
  metadataJson: Prisma.JsonValue | null;
  article: {
    companyId: string | null;
    title: string | null;
    category: string | null;
    tags: Prisma.JsonValue | null;
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
    if (!options?.companyId?.trim()) {
      return [];
    }

    const tokens = this.tokenize(query);

    if (tokens.length === 0) {
      return [];
    }

    const candidateLimit = Math.max(topK * 100, 1000);
    const chunks = await this.prisma.kbChunk.findMany({
      where: this.buildWhere(options),
      take: candidateLimit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        companyId: true,
        articleId: true,
        chunkIndex: true,
        chunkText: true,
        metadataJson: true,
        article: {
          select: {
            companyId: true,
            title: true,
            category: true,
            tags: true,
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
      .filter((result) =>
        this.isAllowedCategory(result, options.allowedCategories),
      )
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
      const language = options.language.trim();
      andFilters.push({
        OR: [{ article: { language } }, { article: { language: null } }],
      });
    }

    if (options?.companyId?.trim()) {
      const companyId = options.companyId.trim();
      andFilters.push({
        article: { companyId },
      });
      andFilters.push({
        OR: [{ companyId }, { companyId: null }],
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
    const searchable = this.normalize(
      `${chunk.article.title ?? ''} ${chunk.article.category ?? ''} ${content}`,
    );
    const searchableTokens = new Set(this.splitTokens(searchable));
    const queryPhrase = this.normalize(query);
    const matchedTokens = queryTokens.filter((token) => searchableTokens.has(token));

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
        companyId: chunk.article.companyId ?? chunk.companyId,
        category: chunk.article.category,
        tags: chunk.article.tags,
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
      'bonjour',
      'bonsoir',
      'cest',
      'dans',
      'des',
      'est',
      'for',
      'hello',
      'les',
      'nos',
      'notre',
      'que',
      'quel',
      'quelle',
      'quels',
      'quelles',
      'salut',
      'sont',
      'the',
      'tout',
      'une',
      'vos',
      'vous',
      'votre',
      '\u0634\u0646\u0648\u0629',
      '\u0634\u0646\u0648',
      '\u0634\u0643\u0648\u0646',
      '\u0627\u0644\u064a',
      '\u0627\u0644\u0644\u064a',
      '\u0641\u064a',
      '\u0645\u0646',
      '\u0639\u0644\u0649',
      '\u0647\u0644',
    ]);

    const baseTokens = this.normalize(value)
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .flatMap((token) =>
        token.length > 4 && token.endsWith('s')
          ? [token, token.slice(0, -1)]
          : [token],
      )
      .filter((token) => [...token].length >= 2 && !stopWords.has(token));

    return Array.from(
      new Set(
        baseTokens.flatMap((token) => [
          token,
          ...this.expandTokenSynonyms(token),
        ]),
      ),
    );
  }

  private expandTokenSynonyms(token: string): string[] {
    const synonyms: Record<string, string[]> = {
      service: [
        'services',
        'catalogue',
        'support',
        'commande',
        'livraison',
        'international',
      ],
      menu: ['repas', 'plats', 'cuisine'],
      manger: ['repas', 'plats'],
      faim: ['repas', 'plats'],
      nourriture: ['repas', 'plats', 'menu'],
      plat: ['repas', 'menu'],
      plats: ['repas', 'menu'],
      today: ['aujourd', 'jour'],
      makla: ['repas', 'plats', 'menu'],
      ma9la: ['repas', 'plats', 'menu'],
      produit: ['produits', 'catalogue', 'stock'],
      produits: ['catalogue', 'stock'],
      services: ['catalogue', 'support'],
      catalogue: ['produits', 'services', 'offres'],
      deliver: ['livraison'],
      delivery: ['livraison'],
      odeur: ['securite', 'alimentaire', 'reclamation', 'anormale'],
      gout: ['securite', 'alimentaire', 'reclamation', 'etrange'],
      bizarre: ['anormale', 'etrange', 'securite'],
      intoxication: ['securite', 'alimentaire', 'reclamation'],
      allergie: ['securite', 'alimentaire', 'reclamation'],
      '\u062a\u0648\u0635\u064a\u0644': ['livraison'],
      '\u062a\u0648\u0635\u0644': ['livraison'],
      '\u062f\u0644\u064a\u0641\u0631\u064a': ['livraison'],
      '\u0627\u0644\u0645\u0627\u0643\u0644\u0629': [
        'repas',
        'plats',
        'menu',
      ],
      '\u0645\u0627\u0643\u0644\u0629': ['repas', 'plats', 'menu'],
      '\u0627\u0644\u0627\u0643\u0644': ['repas', 'plats', 'menu'],
      '\u0627\u0644\u0623\u0643\u0644': ['repas', 'plats', 'menu'],
      '\u0645\u0648\u062c\u0648\u062f\u0629': ['disponibles', 'menu'],
      '\u0645\u062a\u0648\u0641\u0631\u0629': ['disponibles', 'menu'],
      '\u0627\u0644\u064a\u0648\u0645': ['aujourd', 'jour'],
      '\u0642\u062f\u0627\u0634': ['prix'],
      '\u0633\u0648\u0645': ['prix'],
      '\u0627\u0644\u0633\u0639\u0631': ['prix'],
      '\u0631\u064a\u062d\u0629': ['odeur', 'securite', 'reclamation'],
      '\u0637\u0639\u0645': ['gout', 'securite', 'reclamation'],
      '\u062d\u0633\u0627\u0633\u064a\u0629': [
        'allergie',
        'securite',
        'reclamation',
      ],
    };

    return synonyms[token] ?? [];
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u064B-\u065F\u0670]/g, '');
  }

  private splitTokens(value: string): string[] {
    return value
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => [...token].length >= 2);
  }

  private isAllowedCategory(
    result: RetrieverResult,
    allowedCategories?: string[],
  ): boolean {
    if (!allowedCategories?.length) {
      return true;
    }

    const category =
      typeof result.metadata?.category === 'string'
        ? this.normalizeCategory(result.metadata.category)
        : '';
    const allowed = new Set(
      allowedCategories.map((item) => this.normalizeCategory(item)),
    );

    return category.length > 0 && allowed.has(category);
  }

  private normalizeCategory(value: string): string {
    return this.normalize(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
}
