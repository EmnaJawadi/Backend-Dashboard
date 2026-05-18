export interface RetrieverResult {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface RetrieverOptions {
  companyId?: string | null;
  language?: string | null;
  allowedCategories?: string[];
}

export interface Retriever {
  retrieve(
    query: string,
    topK: number,
    options?: RetrieverOptions,
  ): Promise<RetrieverResult[]>;
}
