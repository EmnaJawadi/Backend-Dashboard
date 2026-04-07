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

    const results = await this.retriever.retrieve(dto.query, topK);
    const filtered = this.policy.filter(results);

    const summary = new ConversationSummaryBuilder().build(dto.history ?? []);
    const context = new EvidenceContextBuilder().build(filtered);

    const answer = `Based on context:\n${context}\n\nUser question: ${dto.query}`;

    return new RagResultDto({
      answer,
      context: `${summary}\n\n${context}`,
      sources: filtered.map((r) => String(r.metadata?.id ?? 'unknown')),
    });
  }
}