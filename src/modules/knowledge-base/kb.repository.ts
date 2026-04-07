import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class KbRepository {
  constructor(private readonly prisma: PrismaService) {}

  createArticle(data: {
    title: string;
    slug?: string | null;
    summary?: string | null;
    content: string;
    language?: string | null;
    sourceUrl?: string | null;
    status?: string;
    tags?: string[];
    metadata?: Record<string, unknown> | null;
    publishedAt?: Date | null;
  }) {
    return this.prisma.kbArticle.create({
      data: {
        title: data.title,
        slug: data.slug ?? null,
        summary: data.summary ?? null,
        content: data.content,
        language: data.language ?? null,
        sourceUrl: data.sourceUrl ?? null,
        status: data.status ?? 'draft',
        tags: data.tags ?? [],
        metadata: data.metadata ?? null,
        publishedAt: data.publishedAt ?? null,
      },
      include: {
        chunks: true,
      },
    });
  }

  findMany(params: {
    search?: string;
    tag?: string;
    language?: string;
    status?: string;
    skip?: number;
    take?: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }) {
    const { search, tag, language, status, skip = 0, take = 10, orderBy } = params;

    return this.prisma.kbArticle.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { summary: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(language ? { language } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        chunks: true,
      },
      skip,
      take,
      orderBy: orderBy ?? { createdAt: 'desc' },
    });
  }

  count(params: {
    search?: string;
    tag?: string;
    language?: string;
    status?: string;
  }) {
    const { search, tag, language, status } = params;

    return this.prisma.kbArticle.count({
      where: {
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { summary: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(language ? { language } : {}),
        ...(status ? { status } : {}),
      },
    });
  }

  findById(id: string) {
    return this.prisma.kbArticle.findUnique({
      where: { id },
      include: {
        chunks: true,
      },
    });
  }

  updateArticle(
    id: string,
    data: {
      title?: string;
      slug?: string | null;
      summary?: string | null;
      content?: string;
      language?: string | null;
      sourceUrl?: string | null;
      status?: string;
      tags?: string[];
      metadata?: Record<string, unknown> | null;
      publishedAt?: Date | null;
    },
  ) {
    return this.prisma.kbArticle.update({
      where: { id },
      data,
      include: {
        chunks: true,
      },
    });
  }

  deleteArticle(id: string) {
    return this.prisma.kbArticle.delete({
      where: { id },
    });
  }

  createChunks(
    articleId: string,
    chunks: Array<{
      content: string;
      chunkIndex: number;
      tokens?: number | null;
      embedding?: number[] | null;
      metadata?: Record<string, unknown> | null;
    }>,
  ) {
    return this.prisma.kbChunk.createMany({
      data: chunks.map((chunk) => ({
        articleId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokens: chunk.tokens ?? null,
        embedding: chunk.embedding ?? null,
        metadata: chunk.metadata ?? null,
      })),
    });
  }

  deleteChunksByArticleId(articleId: string) {
    return this.prisma.kbChunk.deleteMany({
      where: { articleId },
    });
  }

  findChunksByArticleId(articleId: string) {
    return this.prisma.kbChunk.findMany({
      where: { articleId },
      orderBy: { chunkIndex: 'asc' },
    });
  }
}