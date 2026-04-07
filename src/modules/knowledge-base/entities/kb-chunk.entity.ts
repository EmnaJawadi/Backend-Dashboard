export class KbChunkEntity {
  id!: string;
  articleId !: string;
  content!: string;
  chunkIndex!: number;
  tokens!: number | null;
  embedding !: number[] | null;
  metadata !: Record<string, unknown> | null;
  createdAt !: Date;
  updatedAt!: Date;

  constructor(partial: Partial<KbChunkEntity>) {
    Object.assign(this, partial);
  }
}