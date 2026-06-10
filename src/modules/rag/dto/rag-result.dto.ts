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
  sourceChunkIds!: string[];
  sourceArticleIds!: string[];
  retrievedChunksPreview!: Array<{
    chunkId: string;
    articleId: string | null;
    score: number;
    preview: string;
  }>;

  constructor(partial: Partial<RagResultDto>) {
    Object.assign(this, partial);
  }
}
