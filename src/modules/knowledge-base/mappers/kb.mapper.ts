import { Injectable } from '@nestjs/common';
import { KbArticleEntity, KbArticleStatus } from '../entities/kb-article.entity';
import { KbChunkEntity } from '../entities/kb-chunk.entity';

type RawKbArticle = {
  id: string;
  title: string;
  slug?: string | null;
  summary?: string | null;
  content: string;
  language?: string | null;
  sourceUrl?: string | null;
  status?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  publishedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  chunks?: RawKbChunk[] | null;
};

type RawKbChunk = {
  id: string;
  articleId: string;
  content: string;
  chunkIndex: number;
  tokens?: number | null;
  embedding?: number[] | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

@Injectable()
export class KbMapper {
  toArticleEntity(data: RawKbArticle): KbArticleEntity {
    return new KbArticleEntity({
      id: data.id,
      title: data.title,
      slug: data.slug ?? null,
      summary: data.summary ?? null,
      content: data.content,
      language: data.language ?? null,
      sourceUrl: data.sourceUrl ?? null,
      status: this.toArticleStatus(data.status),
      tags: data.tags ?? [],
      metadata: data.metadata ?? null,
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
      content: data.content,
      chunkIndex: data.chunkIndex,
      tokens: data.tokens ?? null,
      embedding: data.embedding ?? null,
      metadata: data.metadata ?? null,
      createdAt: this.toDate(data.createdAt),
      updatedAt: this.toDate(data.updatedAt),
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
}