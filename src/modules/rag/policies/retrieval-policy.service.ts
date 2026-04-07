import { Injectable } from '@nestjs/common';

@Injectable()
export class RetrievalPolicyService {
  getTopK(): number {
    return 5;
  }

  filter(results: any[]) {
    return results.filter((r) => (r.score ?? 0) > 0.3);
  }
}