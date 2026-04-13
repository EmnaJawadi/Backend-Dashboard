import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type KbFindParams = {
  search?: string;
  tag?: string;
  lang?: string;
  status?: string;
  skip?: number;
  take?: number;
  orderBy?: Prisma.KbArticleOrderByWithRelationInput;
};

type CreateKbChunkInput = {
  content: string;
  chunkIndex: number;
  embedding?: number[] | null;
  metadata?: Record<string, unknown> | null;
};

type CreateKbArticleInput = Omit<
  Prisma.KbArticleCreateInput,
  'createdAt' | 'updatedAt'
>;

@Injectable()
export class KbRepository {
  constructor(private readonly prisma: PrismaService) {}

  createArticle(data: CreateKbArticleInput) {
    const now = new Date();

    return this.prisma.kbArticle.create({
      data: {
        ...data,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  findMany(params: KbFindParams) {
    return this.prisma.kbArticle.findMany({
      where: this.buildWhere(params),
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy ?? { createdAt: 'desc' },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });
  }

  count(params: KbFindParams) {
    return this.prisma.kbArticle.count({
      where: this.buildWhere(params),
    });
  }

  findById(id: string) {
    return this.prisma.kbArticle.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });
  }

  updateArticle(id: string, data: Prisma.KbArticleUpdateInput) {
    return this.prisma.kbArticle.update({
      where: { id },
      data,
    });
  }

  deleteArticle(id: string) {
    return this.prisma.kbArticle.delete({
      where: { id },
    });
  }

  async createChunks(articleId: string, chunks: CreateKbChunkInput[]) {
    if (chunks.length === 0) {
      return;
    }

    await this.prisma.kbChunk.createMany({
      data: chunks.map((chunk) => ({
        articleId,
        chunkIndex: chunk.chunkIndex,
        chunkText: chunk.content,
        embeddingsVector: null,
        metadataJson: (chunk.metadata ?? null) as Prisma.InputJsonValue,
        createdAt: new Date(),
      })),
    });
  }

  findChunksByArticleId(articleId: string) {
    return this.prisma.kbChunk.findMany({
      where: { articleId },
      orderBy: { chunkIndex: 'asc' },
    });
  }

  private buildWhere(params: KbFindParams): Prisma.KbArticleWhereInput {
    return {
      ...(params.search
        ? {
            OR: [
              {
                title: {
                  contains: params.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                body: {
                  contains: params.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
      ...(params.tag ? { tags: { array_contains: [params.tag] } } : {}),
      ...(params.lang ? { lang: params.lang } : {}),
      ...(params.status ? { status: params.status } : {}),
    };
  }
}
