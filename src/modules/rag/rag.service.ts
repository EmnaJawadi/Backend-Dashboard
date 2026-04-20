import { Injectable } from '@nestjs/common';
import { RagQueryDto } from './dto/rag-query.dto';
import { RagResultDto } from './dto/rag-result.dto';
import { PgvectorRetriever } from './retrievers/pgvector.retriever';
import { RetrievalPolicyService } from './policies/retrieval-policy.service';
import { ConversationSummaryBuilder } from './builders/conversation-summary.builder';
import { EvidenceContextBuilder } from './builders/evidence-context.builder';

@Injectable()
export class RagService {
  constructor(
    private readonly retriever: PgvectorRetriever,
    private readonly policy: RetrievalPolicyService,
  ) {}

  async query(dto: RagQueryDto): Promise<RagResultDto> {
    const topK = this.policy.getTopK();

    const results = await this.retriever.retrieve(dto.query, topK, {
      companyId: dto.companyId,
      language: dto.language,
    });
    const filtered = this.policy.filter(results);

    const summary = new ConversationSummaryBuilder().build(dto.history ?? []);
    const context = new EvidenceContextBuilder().build(filtered);
    const scores = filtered.map((result) => result.score ?? 0);
    const confidence =
      scores.length > 0
        ? Number(
            (
              scores.reduce((sum, score) => sum + score, 0) / scores.length
            ).toFixed(2),
          )
        : 0;

    const answer = `Based on context:\n${context}\n\nUser question: ${dto.query}`;

    return new RagResultDto({
      answer,
      context: `${summary}\n\n${context}`,
      sources: filtered.map((r) => String(r.metadata?.id ?? 'unknown')),
      confidence,
      hasReliableSources:
        filtered.length > 0 &&
        Math.max(...scores, 0) >= this.policy.getMinScore(),
      evidences: filtered.map((result) => ({
        id: String(result.metadata?.id ?? 'unknown'),
        content: result.content,
        score: result.score ?? 0,
        metadata: result.metadata,
      })),
    });
  }
}
