import { Injectable } from '@nestjs/common';

@Injectable()
export class RetrievalPolicyService {
  private readonly minScore = 0.2;

  getTopK(): number {
    return 5;
  }

  getMinScore(): number {
    return this.minScore;
  }

  filter<T extends { score?: number }>(results: T[]) {
    return results.filter((result) => (result.score ?? 0) >= this.minScore);
  }
}
