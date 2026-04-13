import { Injectable } from '@nestjs/common';
import {
  KbArticleEntity,
  KbArticleStatus,
} from '../entities/kb-article.entity';
import { KbChunkEntity } from '../entities/kb-chunk.entity';

type RawKbArticle = {
  id: string;
  title: string | null;
  body: string | null;
  category?: string | null;
  lang?: string | null;
  sourceUrl?: string | null;
  status?: string | null;
  tags?: unknown;
  publishedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  chunks?: RawKbChunk[] | null;
};

type RawKbChunk = {
  id: string;
  articleId: string;
  chunkText: string | null;
  chunkIndex: number;
  embeddingsVector?: Uint8Array | null;
  metadataJson?: unknown;
  createdAt?: Date | string;
};

@Injectable()
export class KbMapper {
  toArticleEntity(data: RawKbArticle): KbArticleEntity {
    return new KbArticleEntity({
      id: data.id,
      title: data.title ?? '',
      slug: null,
      summary: data.category ?? null,
      content: data.body ?? '',
      language: data.lang ?? null,
      sourceUrl: data.sourceUrl ?? null,
      status: this.toArticleStatus(data.status),
      tags: this.toStringArray(data.tags),
      metadata: null,
      publishedAt: this.toNullableDate(data.publishedAt),
      createdAt: this.toDate(data.createdAt),
      updatedAt: this.toDate(data.updatedAt),
      chunks: data.chunks?.map((chunk) => this.toChunkEntity(chunk)) ?? [],
    });
  }

  toChunkEntity(data: RawKbChunk): KbChunkEntity {
    return new KbChunkEntity({
      id: data.id,
      articleId: data.articleId,
      content: data.chunkText ?? '',
      chunkIndex: data.chunkIndex,
      tokens: null,
      embedding: null,
      metadata: this.toRecord(data.metadataJson),
      createdAt: this.toDate(data.createdAt),
      updatedAt: this.toDate(data.createdAt),
    });
  }

  toArticleResponse(entity: KbArticleEntity) {
    return {
      id: entity.id,
      title: entity.title,
      slug: entity.slug,
      summary: entity.summary,
      content: entity.content,
      language: entity.language,
      sourceUrl: entity.sourceUrl,
      status: entity.status,
      tags: entity.tags,
      metadata: entity.metadata,
      publishedAt: entity.publishedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      chunks:
        entity.chunks?.map((chunk) => ({
          id: chunk.id,
          articleId: chunk.articleId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          tokens: chunk.tokens,
          metadata: chunk.metadata,
          createdAt: chunk.createdAt,
          updatedAt: chunk.updatedAt,
        })) ?? [],
    };
  }

  toChunkResponse(entity: KbChunkEntity) {
    return {
      id: entity.id,
      articleId: entity.articleId,
      content: entity.content,
      chunkIndex: entity.chunkIndex,
      tokens: entity.tokens,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  toArticleListResponse(entities: KbArticleEntity[]) {
    return entities.map((entity) => this.toArticleResponse(entity));
  }

  toChunkListResponse(entities: KbChunkEntity[]) {
    return entities.map((entity) => this.toChunkResponse(entity));
  }

  private toArticleStatus(status?: string | null): KbArticleStatus {
    switch ((status ?? '').toLowerCase()) {
      case KbArticleStatus.PUBLISHED:
        return KbArticleStatus.PUBLISHED;
      case KbArticleStatus.ARCHIVED:
        return KbArticleStatus.ARCHIVED;
      case KbArticleStatus.DRAFT:
      default:
        return KbArticleStatus.DRAFT;
    }
  }

  private toDate(value?: Date | string | null): Date {
    if (!value) {
      return new Date();
    }

    return value instanceof Date ? value : new Date(value);
  }

  private toNullableDate(value?: Date | string | null): Date | null {
    if (!value) {
      return null;
    }

    return value instanceof Date ? value : new Date(value);
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }

    return [];
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return null;
  }
}