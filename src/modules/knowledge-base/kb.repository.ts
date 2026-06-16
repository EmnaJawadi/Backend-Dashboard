import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type KbFindParams = {
  companyId?: string;
  search?: string;
  tag?: string;
  language?: string;
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
  Prisma.KbArticleUncheckedCreateInput,
  'createdAt' | 'updatedAt'
>;

type KbWriteClient = Prisma.TransactionClient | PrismaService;

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
        company: {
          select: { id: true, name: true, legalName: true },
        },
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

  findById(id: string, companyId?: string) {
    return this.prisma.kbArticle.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        company: {
          select: { id: true, name: true, legalName: true },
        },
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });
  }

  updateArticle(id: string, data: Prisma.KbArticleUpdateInput, companyId?: string) {
    const where: Prisma.KbArticleWhereUniqueInput = companyId
      ? { id_companyId: { id, companyId } }
      : { id };
    return this.prisma.kbArticle.update({ where, data });
  }

  async deleteArticle(id: string, companyId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.kbChunk.deleteMany({
        where: { articleId: id, companyId },
      });

      return tx.kbArticle.delete({
        where: { id },
      });
    });
  }

  async createChunks(
    articleId: string,
    chunks: CreateKbChunkInput[],
    companyId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertArticleCompany(tx, articleId, companyId);
      await this.insertChunks(tx, articleId, chunks, companyId);
    });
  }

  async replaceChunksByArticleId(
    articleId: string,
    chunks: CreateKbChunkInput[],
    companyId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertArticleCompany(tx, articleId, companyId);
      await tx.kbChunk.deleteMany({
        where: { articleId, companyId },
      });
      await this.insertChunks(tx, articleId, chunks, companyId);
    });
  }

  deleteChunksByArticleId(articleId: string, companyId: string) {
    return this.prisma.kbChunk.deleteMany({
      where: { articleId, companyId },
    });
  }

  deleteChunksForCompany(companyId: string) {
    return this.prisma.kbChunk.deleteMany({
      where: {
        OR: [
          { companyId },
          {
            article: {
              companyId,
            },
          },
        ],
      },
    });
  }

  findChunksByArticleId(articleId: string, companyId: string) {
    return this.prisma.kbChunk.findMany({
      where: {
        articleId,
        companyId,
        article: {
          companyId,
        },
      },
      orderBy: { chunkIndex: 'asc' },
    });
  }

  private buildWhere(params: KbFindParams): Prisma.KbArticleWhereInput {
    return {
      ...(params.companyId ? { companyId: params.companyId } : {}),
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
      ...(params.language ? { language: params.language } : {}),
      ...(params.status
        ? {
            status: params.status as any,
          }
        : {}),
    };
  }

  private normalizeEmbedding(embedding?: number[] | null): number[] {
    if (!embedding?.length) {
      return [];
    }

    const dimensions = 1536;

    return Array.from({ length: dimensions }, (_, index) => {
      const value = embedding[index] ?? 0;
      return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
    });
  }

  private toVectorLiteral(values: number[]): string {
    return `[${values.join(',')}]`;
  }

  private async assertArticleCompany(
    client: KbWriteClient,
    articleId: string,
    companyId: string,
  ): Promise<void> {
    const article = await client.kbArticle.findFirst({
      where: { id: articleId, companyId },
      select: { id: true },
    });

    if (!article) {
      throw new Error(
        `Knowledge base article ${articleId} does not belong to company ${companyId}`,
      );
    }
  }

  private async insertChunks(
    client: KbWriteClient,
    articleId: string,
    chunks: CreateKbChunkInput[],
    companyId: string,
  ): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const now = new Date();
    const rows = chunks.map((chunk) => ({
      id: randomUUID(),
      companyId,
      articleId,
      chunkIndex: chunk.chunkIndex,
      chunkText: chunk.content,
      embedding: this.normalizeEmbedding(chunk.embedding),
      metadataJson: JSON.stringify(chunk.metadata ?? null),
      createdAt: now,
    }));

    if (rows.some((row) => row.embedding.length > 0)) {
      await client.$executeRaw(Prisma.sql`
        INSERT INTO "kb_chunks"
          ("id", "company_id", "article_id", "chunk_index", "chunk_text", "embedding_vector", "metadata_json", "created_at")
        VALUES ${Prisma.join(
          rows.map((row) => Prisma.sql`(
            ${row.id},
            ${row.companyId},
            ${row.articleId},
            ${row.chunkIndex},
            ${row.chunkText},
            ${row.embedding.length ? this.toVectorLiteral(row.embedding) : null}::vector,
            ${row.metadataJson}::jsonb,
            ${row.createdAt}
          )`),
        )}
      `);
      return;
    }

    await client.kbChunk.createMany({
      data: rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        articleId: row.articleId,
        chunkIndex: row.chunkIndex,
        chunkText: row.chunkText,
        metadataJson: JSON.parse(row.metadataJson) as Prisma.InputJsonValue,
        createdAt: row.createdAt,
      })),
    });
  }
}
