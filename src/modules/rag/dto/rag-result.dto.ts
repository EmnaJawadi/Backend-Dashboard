export class RagResultDto {
  answer!: string;
  context!: string;
  sources!: string[];
  confidence!: number;
  hasReliableSources!: boolean;
  evidences!: Array<{
    id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;

  constructor(partial: Partial<RagResultDto>) {
    Object.assign(this, partial);
  }
}
