import { Injectable, Logger } from '@nestjs/common';
import { RagQueryDto } from './dto/rag-query.dto';
import { RagResultDto } from './dto/rag-result.dto';
import { PgvectorRetriever } from './retrievers/pgvector.retriever';
import { RetrievalPolicyService } from './policies/retrieval-policy.service';
import { ConversationSummaryBuilder } from './builders/conversation-summary.builder';
import { EvidenceContextBuilder } from './builders/evidence-context.builder';
import { ProductSearchService } from '../products/product-search.service';
import { RagSearchService } from './rag-search.service';
import { deduplicateRagResults } from './utils/deduplicate-rag-results';

@Injectable()
export class RagService implements RagSearchService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly retriever: PgvectorRetriever,
    private readonly policy: RetrievalPolicyService,
    private readonly productSearchService: ProductSearchService,
  ) {}

  async query(dto: RagQueryDto): Promise<RagResultDto> {
    if (!dto.companyId?.trim()) {
      this.logger.warn(
        `RAG_NO_RELIABLE_SOURCE reason=missing_company_id queryLength=${dto.query.length}`,
      );

      return new RagResultDto({
        answer: '',
        context: '',
        sources: [],
        confidence: 0,
        hasReliableSources: false,
        evidences: [],
        sourceChunkIds: [],
        sourceArticleIds: [],
        retrievedChunksPreview: [],
      });
    }

    const companyId = dto.companyId.trim();
    const topK = this.policy.getTopK();

    this.logger.log(
      `RAG_SEARCH_STARTED companyId=${companyId} queryLength=${dto.query.length} topK=${topK}`,
    );
    const results = await this.retriever.retrieve(dto.query, topK, {
      companyId,
      language: dto.language,
      allowedCategories: dto.allowedCategories,
    });
    const filtered = this.policy.rank(
      this.policy.filter(results, {
        allowedCategories: dto.allowedCategories,
        intent: dto.intent,
      }),
      {
        allowedCategories: dto.allowedCategories,
        intent: dto.intent,
      },
    );
    const productResults = this.shouldSearchProductsForIntent(dto.intent)
      ? await this.productSearchService.searchProducts({
          companyId,
          query: dto.query,
          limit: topK,
        })
      : [];
    const productEvidences = productResults
      .filter((result) => result.score >= this.policy.getMinScore())
      .map((result) => ({
        content: this.productSearchService.productToEvidence(result.product),
        score: result.score,
        metadata: {
          id: `product:${result.product.id}`,
          productId: result.product.id,
          sourceType: 'product',
          companyId: result.product.companyId,
          productName: result.product.name,
          category: 'PRODUITS',
          productCategory: result.product.category ?? null,
          isAvailable: result.product.isAvailable,
          status: result.product.status,
          price: result.product.price,
          currency: result.product.currency,
          matchedTokens: result.matchedTokens,
        },
      }));
    const dedupedEvidences = deduplicateRagResults(
      [...filtered, ...productEvidences].filter((evidence) =>
        this.hasUsableContent(evidence),
      ),
      6,
    );
    const outOfScopeCount = dedupedEvidences.filter(
      (evidence) => !this.isEvidenceInCompanyScope(evidence, companyId),
    ).length;
    if (outOfScopeCount > 0) {
      this.logger.warn(
        `RAG_SCOPE_FILTERED companyId=${companyId} rejected=${outOfScopeCount}`,
      );
    }

    const rankedEvidences = this.policy
      .rank(dedupedEvidences, {
        allowedCategories: dto.allowedCategories,
        intent: dto.intent,
      })
      .filter((evidence) => this.isEvidenceInCompanyScope(evidence, companyId))
      .filter(
        (evidence) =>
          (evidence.score ?? 0) >= this.policy.getMinScore(),
      );
    const reliableEvidences = rankedEvidences.slice(0, topK);
    const cleanedReliableEvidences = reliableEvidences.map((evidence) => ({
      ...evidence,
      content: this.cleanEvidenceContent(evidence.content),
    }));

    const summary = new ConversationSummaryBuilder().build(dto.history ?? []);
    const context = new EvidenceContextBuilder().build(cleanedReliableEvidences);
    const scores = reliableEvidences.map((result) => result.score ?? 0);
    const confidence =
      scores.length > 0
        ? Number(
            (
              scores.reduce((sum, score) => sum + score, 0) / scores.length
            ).toFixed(2),
          )
        : 0;

    const answer = context;
    const hasReliableSources =
      reliableEvidences.length > 0 &&
      Math.max(...scores, 0) >= this.policy.getMinScore();

    this.logger.log(
      `RAG_SEARCH_RESULT companyId=${dto.companyId ?? 'null'} queryLength=${dto.query.length} retrieved=${results.length} filtered=${filtered.length} productMatches=${productEvidences.length} reliable=${hasReliableSources} confidence=${confidence} chunkIds=${this.extractChunkIds(reliableEvidences).join(',') || 'none'}`,
    );
    this.logger.log(
      `RAG_KB_SCOPE companyId=${companyId} sourceArticleIds=${this.extractArticleIds(reliableEvidences).join(',') || 'none'} sourceChunkIds=${this.extractChunkIds(reliableEvidences).join(',') || 'none'}`,
    );

    if (!hasReliableSources) {
      this.logger.warn(
        `RAG_NO_RELIABLE_SOURCE companyId=${dto.companyId ?? 'null'} queryLength=${dto.query.length} retrieved=${results.length} filtered=${filtered.length} productMatches=${productEvidences.length}`,
      );
    }

    return new RagResultDto({
      answer,
      context: `${summary}\n\n${context}`,
      sources: reliableEvidences.map((r) => String(r.metadata?.id ?? 'unknown')),
      confidence,
      hasReliableSources,
      evidences: cleanedReliableEvidences.map((result) => ({
        id: String(result.metadata?.id ?? 'unknown'),
        content: this.dedupeSentences(result.content),
        score: result.score ?? 0,
        metadata: result.metadata,
      })),
      sourceChunkIds: this.extractChunkIds(reliableEvidences),
      sourceArticleIds: this.extractArticleIds(reliableEvidences),
      retrievedChunksPreview: this.buildRetrievedChunksPreview(reliableEvidences),
    });
  }

  private extractChunkIds(
    evidences: Array<{ metadata?: Record<string, unknown> }>,
  ): string[] {
    return Array.from(
      new Set(
        evidences
          .map((evidence) => evidence.metadata?.chunkId ?? evidence.metadata?.id)
          .filter((id): id is string => typeof id === 'string' && !id.startsWith('product:')),
      ),
    );
  }

  private extractArticleIds(
    evidences: Array<{ metadata?: Record<string, unknown> }>,
  ): string[] {
    return Array.from(
      new Set(
        evidences
          .map((evidence) => evidence.metadata?.articleId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
  }

  private buildRetrievedChunksPreview(
    evidences: Array<{
      content: string;
      score?: number;
      metadata?: Record<string, unknown>;
    }>,
  ): Array<{
    chunkId: string;
    articleId: string | null;
    score: number;
    preview: string;
  }> {
    return evidences
      .filter((evidence) => typeof (evidence.metadata?.chunkId ?? evidence.metadata?.id) === 'string')
      .filter((evidence) => !String(evidence.metadata?.id ?? '').startsWith('product:'))
      .map((evidence) => ({
        chunkId: String(evidence.metadata?.chunkId ?? evidence.metadata?.id),
        articleId:
          typeof evidence.metadata?.articleId === 'string'
            ? evidence.metadata.articleId
            : null,
        score: Number((evidence.score ?? 0).toFixed(3)),
        preview: this.truncatePreview(evidence.content),
      }))
      .slice(0, 10);
  }

  private hasUsableContent(evidence: {
    content: string;
    metadata?: Record<string, unknown>;
  }): boolean {
    const content = evidence.content.replace(/\s+/g, ' ').trim();
    if (content.length < 20) {
      return false;
    }

    const title =
      typeof evidence.metadata?.articleTitle === 'string'
        ? evidence.metadata.articleTitle.trim()
        : '';
    const normalizedContent = this.normalize(content);
    const normalizedTitle = this.normalize(title);

    if (normalizedTitle && normalizedContent === normalizedTitle) {
      return false;
    }

    const withoutTitle = normalizedTitle
      ? normalizedContent.replace(normalizedTitle, '').trim()
      : normalizedContent;

    return withoutTitle.split(/\s+/).filter(Boolean).length >= 3;
  }

  private cleanEvidenceContent(content: string): string {
    const blocks = content.trim().split(/\n{2,}/);
    let cleaned = content.trim();
    if (
      blocks.length > 1 &&
      /\b(section|mots-cles|keywords)\s*:/i.test(blocks[0])
    ) {
      cleaned = blocks.slice(1).join('\n\n').trim();
    }

    return cleaned.replace(/^#{1,6}\s*/gm, '').trim();
  }

  private shouldSearchProductsForIntent(intent?: string | null): boolean {
    const normalized = (intent ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    return [
      'BUSINESS_QUERY',
      'CATALOG_QUERY',
      'PRODUCTS_SERVICES_QUERY',
      'AVAILABILITY_QUERY',
      'PRODUCT_AVAILABILITY_QUERY',
      'PRICE_QUERY',
      'ORDER_INTENT',
    ].includes(normalized);
  }

  private isEvidenceInCompanyScope(
    evidence: { metadata?: Record<string, unknown> },
    companyId: string,
  ): boolean {
    return evidence.metadata?.companyId === companyId;
  }

  private dedupeSentences(content: string): string {
    const seen = new Set<string>();

    return content
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => {
        const key = this.normalize(sentence);

        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .join(' ');
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private truncatePreview(value: string, maxLength = 280): string {
    const compact = value.replace(/\s+/g, ' ').trim();

    return compact.length > maxLength
      ? `${compact.slice(0, maxLength).trim()}...`
      : compact;
  }
}
