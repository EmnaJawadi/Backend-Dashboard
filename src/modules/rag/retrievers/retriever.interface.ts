export interface RetrieverResult {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface Retriever {
  retrieve(query: string, topK: number): Promise<RetrieverResult[]>;
}