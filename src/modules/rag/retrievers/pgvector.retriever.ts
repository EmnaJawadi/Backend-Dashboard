import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { EmbeddingsService } from '../../knowledge-base/ingestion/embeddings.service';
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

type RawVectorKbChunk = {
  id: string;
  company_id: string | null;
  article_id: string;
  chunk_index: number;
  chunk_text: string | null;
  metadata_json: Prisma.JsonValue | null;
  article_company_id: string | null;
  article_title: string | null;
  article_category: string | null;
  article_tags: Prisma.JsonValue | null;
  article_language: string | null;
  article_status: string;
  article_source_url: string | null;
  score: number | string | null;
};

@Injectable()
export class PgvectorRetriever implements Retriever {
  private readonly logger = new Logger(PgvectorRetriever.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService = new EmbeddingsService(),
  ) {}

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
    const vectorResults = await this.tryRetrieveWithVector(
      query,
      candidateLimit,
      options,
    );
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

    const textResults = chunks
      .map((chunk) => this.scoreChunk(chunk as RawKbChunk, tokens, query))
      .filter((result) => (result.score ?? 0) > 0)
      .filter((result) => this.isAllowedCategory(result, options.allowedCategories));

    return this.dedupeByChunkIdKeepingBestScore([...vectorResults, ...textResults])
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, topK);
  }

  private async tryRetrieveWithVector(
    query: string,
    candidateLimit: number,
    options?: RetrieverOptions,
  ): Promise<RetrieverResult[]> {
    try {
      const companyId = options?.companyId?.trim();

      if (!companyId) {
        return [];
      }

      const queryEmbedding = await this.embeddingsService.generateEmbedding(query);

      if (!queryEmbedding.length) {
        return [];
      }

      const vectorLiteral = this.toVectorLiteral(queryEmbedding);
      const languageFilter = options?.language?.trim()
        ? Prisma.sql`AND (a."language" = ${options.language.trim()} OR a."language" IS NULL)`
        : Prisma.empty;
      const rows = await this.prisma.$queryRaw<RawVectorKbChunk[]>(Prisma.sql`
        SELECT
          c."id",
          c."company_id",
          c."article_id",
          c."chunk_index",
          c."chunk_text",
          c."metadata_json",
          a."company_id" AS "article_company_id",
          a."title" AS "article_title",
          a."category" AS "article_category",
          a."tags" AS "article_tags",
          a."language" AS "article_language",
          a."status" AS "article_status",
          a."source_url" AS "article_source_url",
          (1 - (c."embedding_vector" <=> ${vectorLiteral}::vector)) AS "score"
        FROM "kb_chunks" c
        INNER JOIN "kb_articles" a ON a."id" = c."article_id"
        WHERE
          c."chunk_text" IS NOT NULL
          AND c."embedding_vector" IS NOT NULL
          AND a."status" = 'published'
          AND a."company_id" = ${companyId}
          AND c."company_id" = ${companyId}
          ${languageFilter}
        ORDER BY c."embedding_vector" <=> ${vectorLiteral}::vector
        LIMIT ${candidateLimit}
      `);

      return rows
        .map((row) => this.scoreVectorChunk(row))
        .filter((result) => (result.score ?? 0) > 0)
        .filter((result) =>
          this.isAllowedCategory(result, options?.allowedCategories),
        );
    } catch (error) {
      this.logger.warn(
        `VECTOR_RAG_FALLBACK reason=${error instanceof Error ? error.message : 'unknown'}`,
      );

      return [];
    }
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
        companyId,
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
    const categoryIntentBonus = this.categoryIntentBonus(
      query,
      chunk.article.category,
    );
    const score = Number(
      Math.min(1, tokenScore + phraseBonus + titleBonus + categoryIntentBonus).toFixed(3),
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

  private scoreVectorChunk(row: RawVectorKbChunk): RetrieverResult {
    return {
      content: row.chunk_text ?? '',
      score: Number(Number(row.score ?? 0).toFixed(3)),
      metadata: {
        id: row.id,
        chunkId: row.id,
        articleId: row.article_id,
        articleTitle: row.article_title,
        companyId: row.article_company_id ?? row.company_id,
        category: row.article_category,
        tags: row.article_tags,
        chunkIndex: row.chunk_index,
        language: row.article_language,
        sourceUrl: row.article_source_url,
        metadata: row.metadata_json,
        matchedBy: 'vector',
      },
    };
  }

  private dedupeByChunkIdKeepingBestScore(
    results: RetrieverResult[],
  ): RetrieverResult[] {
    const bestByChunkId = new Map<string, RetrieverResult>();
    const fallbackResults: RetrieverResult[] = [];

    for (const result of results) {
      const key = String(result.metadata?.chunkId ?? result.metadata?.id ?? '');

      if (!key) {
        fallbackResults.push(result);
        continue;
      }

      const current = bestByChunkId.get(key);

      if (!current || (result.score ?? 0) > (current.score ?? 0)) {
        bestByChunkId.set(key, result);
      }
    }

    return [...bestByChunkId.values(), ...fallbackResults];
  }

  private tokenize(value: string): string[] {
    const stopWords = new Set([
      'avec',
      'aux',
      'au',
      'bonjour',
      'bonsoir',
      'cest',
      'dans',
      'de',
      'des',
      'du',
      'en',
      'est',
      'for',
      'hello',
      'jaimerais',
      'je',
      'l',
      'la',
      'le',
      'connaitre',
      'quel',
      'quelle',
      'quels',
      'quelles',
      'qule',
      'qules',
      'les',
      'nos',
      'notre',
      'que',
      'quel',
      'quelle',
      'quels',
      'quelles',
      'salut',
      'savoir',
      'sont',
      'souhaite',
      'the',
      'tout',
      'une',
      'vos',
      'vous',
      'votre',
      'veux',
      'voudrais',
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
      service: ['services', 'offres', 'prestations', 'support'],
      services: ['service', 'offres', 'prestations', 'support'],
      produit: ['produits', 'catalogue', 'stock'],
      produits: ['produit', 'catalogue', 'stock'],
      article: ['articles', 'catalogue', 'stock'],
      articles: ['article', 'catalogue', 'stock'],
      offre: ['offres', 'services', 'produits'],
      offres: ['offre', 'services', 'produits'],
      catalogue: ['produits', 'services', 'offres'],
      menu: ['plats', 'repas', 'produits', 'catalogue'],
      plat: ['menu', 'repas', 'produits', 'catalogue'],
      plats: ['menu', 'repas', 'produits', 'catalogue'],
      repas: ['menu', 'plats', 'produits'],
      makla: ['menu', 'plats', 'repas'],
      ma9la: ['menu', 'plats', 'repas'],
      dish: ['menu', 'plats', 'produits'],
      dishes: ['menu', 'plats', 'produits'],
      disponible: ['disponibilite', 'stock'],
      disponibilite: ['disponible', 'stock'],
      stock: ['disponible', 'disponibilite'],
      tarif: ['tarifs', 'prix'],
      tarifs: ['tarif', 'prix'],
      price: ['prix', 'tarifs'],
      today: ['aujourd', 'jour'],
      deliver: ['livraison'],
      delivery: ['livraison'],
      shipping: ['livraison'],
      payment: ['paiement'],
      order: ['commande'],
      commande: ['order', 'ncommandi'],
      ncommandi: ['commande', 'order'],
      touslou: ['livraison'],
      twasslou: ['livraison'],
      '9addech': ['prix'],
      '9adech': ['prix'],
      soum: ['prix'],
      chrab: ['boissons'],
      machroub: ['boissons'],
      '\u062a\u0648\u0635\u064a\u0644': ['livraison'],
      '\u062a\u0648\u0635\u0644': ['livraison'],
      '\u062f\u0644\u064a\u0641\u0631\u064a': ['livraison'],
      '\u0645\u0648\u062c\u0648\u062f': ['disponible', 'stock'],
      '\u0645\u062a\u0648\u0641\u0631': ['disponible', 'stock'],
      '\u0627\u0644\u064a\u0648\u0645': ['aujourd', 'jour'],
      '\u0642\u062f\u0627\u0634': ['prix'],
      '\u0633\u0648\u0645': ['prix'],
      '\u0627\u0644\u0633\u0639\u0631': ['prix'],
    };

    return synonyms[token] ?? [];
  }

  private categoryIntentBonus(query: string, category?: string | null): number {
    const normalizedQuery = this.normalize(query);
    const normalizedCategory = this.normalizeCategory(category ?? '');
    const hasTerm = (terms: string[]) =>
      terms.some((term) =>
        new RegExp(`(^|[^\\p{L}\\p{N}])${term}([^\\p{L}\\p{N}]|$)`, 'u').test(
          normalizedQuery,
        ),
      );

    if (
      normalizedCategory === 'produits' &&
      hasTerm(['menu', 'plat', 'plats', 'produit', 'produits', 'catalogue', 'dish', 'dishes'])
    ) {
      return 0.4;
    }

    if (
      normalizedCategory === 'services' &&
      hasTerm(['service', 'services', 'prestation', 'prestations', 'offre', 'offres'])
    ) {
      return 0.4;
    }

    return 0;
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
      .flatMap((token) =>
        token.length > 4 && token.endsWith('s')
          ? [token, token.slice(0, -1)]
          : [token],
      )
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

  private toVectorLiteral(values: number[]): string {
    const dimensions = 1536;
    const normalized = Array.from({ length: dimensions }, (_, index) => {
      const value = values[index] ?? 0;
      return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
    });

    return `[${normalized.join(',')}]`;
  }
}
