import { KbChunkEntity } from './kb-chunk.entity';

export enum KbArticleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export class KbArticleEntity {
  id!: string;
  title!: string;
  slug!: string | null;
  summary!: string | null;
  content!: string;
  language!: string | null;
  sourceUrl!: string | null;
  status!: KbArticleStatus;
  tags!: string[];
  metadata!: Record<string, unknown> | null;
  publishedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  chunks!: KbChunkEntity[];

  constructor(partial: Partial<KbArticleEntity>) {
    Object.assign(this, partial);
  }
}