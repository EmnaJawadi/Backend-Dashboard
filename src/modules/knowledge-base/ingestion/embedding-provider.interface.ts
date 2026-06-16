export interface EmbeddingProvider {
  readonly name: string;
  generate(
    texts: string[],
    dimensions: number,
    task: 'document' | 'query',
  ): Promise<number[][]>;
}
