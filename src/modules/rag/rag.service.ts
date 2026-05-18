import { Injectable, Logger } from '@nestjs/common';
import { RagQueryDto } from './dto/rag-query.dto';
import { RagResultDto } from './dto/rag-result.dto';
import { PgvectorRetriever } from './retrievers/pgvector.retriever';
import { RetrievalPolicyService } from './policies/retrieval-policy.service';
import { ConversationSummaryBuilder } from './builders/conversation-summary.builder';
import { EvidenceContextBuilder } from './builders/evidence-context.builder';
import { ProductSearchService } from '../products/product-search.service';

@Injectable()
export class RagService {
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
      });
    }

    const topK = this.policy.getTopK();

    this.logger.log(
      `RAG_SEARCH_STARTED companyId=${dto.companyId} queryLength=${dto.query.length} topK=${topK}`,
    );
    const results = await this.retriever.retrieve(dto.query, topK, {
      companyId: dto.companyId,
      language: dto.language,
      allowedCategories: dto.allowedCategories,
    });
    const filtered = this.policy.filter(results, {
      allowedCategories: dto.allowedCategories,
      intent: dto.intent,
    });
    const productResults = await this.productSearchService.searchProducts({
      companyId: dto.companyId,
      query: dto.query,
      limit: topK,
    });
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
          category: result.product.category ?? 'PRODUCT',
          isAvailable: result.product.isAvailable,
          status: result.product.status,
          price: result.product.price,
          currency: result.product.currency,
          matchedTokens: result.matchedTokens,
        },
      }));
    const reliableEvidences = [...filtered, ...productEvidences]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, topK);

    const summary = new ConversationSummaryBuilder().build(dto.history ?? []);
    const context = new EvidenceContextBuilder().build(reliableEvidences);
    const scores = reliableEvidences.map((result) => result.score ?? 0);
    const confidence =
      scores.length > 0
        ? Number(
            (
              scores.reduce((sum, score) => sum + score, 0) / scores.length
            ).toFixed(2),
          )
        : 0;

    const answer = `Based on context:\n${context}\n\nUser question: ${dto.query}`;
    const hasReliableSources =
      reliableEvidences.length > 0 &&
      Math.max(...scores, 0) >= this.policy.getMinScore();

    this.logger.log(
      `RAG_SEARCH_RESULT companyId=${dto.companyId ?? 'null'} queryLength=${dto.query.length} retrieved=${results.length} filtered=${filtered.length} productMatches=${productEvidences.length} reliable=${hasReliableSources} confidence=${confidence}`,
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
      evidences: reliableEvidences.map((result) => ({
        id: String(result.metadata?.id ?? 'unknown'),
        content: result.content,
        score: result.score ?? 0,
        metadata: result.metadata,
      })),
    });
  }
}
