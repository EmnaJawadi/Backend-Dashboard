import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { PublishKbArticleDto } from './dto/publish-kb-article.dto';
import { KbArticleQueryDto } from './dto/kb-article-query.dto';
import { IngestKbSourceDto } from './dto/ingest-kb-source.dto';
import { KbRepository } from './kb.repository';
import { KbMapper } from './mappers/kb.mapper';
import { IngestionService, IngestionSourceType } from './ingestion/ingestion.service';

type RawKbChunk = {
  content: string;
  chunkIndex: number;
  embedding?: number[] | null;
  metadata?: Record<string, unknown> | null;
};

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
  chunks?: Array<{
    id: string;
    articleId: string;
    content: string;
    chunkIndex: number;
    tokens?: number | null;
    embedding?: number[] | null;
    metadata?: Record<string, unknown> | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  }> | null;
};

@Injectable()
export class KbArticlesService {
  constructor(
    private readonly kbRepository: KbRepository,
    private readonly kbMapper: KbMapper,
    private readonly ingestionService: IngestionService,
  ) {}

  async create(createKbArticleDto: CreateKbArticleDto) {
    const article = await this.kbRepository.createArticle({
      title: createKbArticleDto.title,
      slug: createKbArticleDto.slug ?? null,
      summary: createKbArticleDto.summary ?? null,
      content: createKbArticleDto.content,
      language: createKbArticleDto.language ?? null,
      sourceUrl: createKbArticleDto.sourceUrl ?? null,
      tags: createKbArticleDto.tags ?? [],
      metadata: createKbArticleDto.metadata ?? null,
      status: 'draft',
      publishedAt: null,
    });

    return this.kbMapper.toArticleEntity(article);
  }

  async findAll(query: KbArticleQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.kbRepository.findMany({
        search: query.search,
        tag: query.tag,
        language: query.language,
        status: query.status,
        skip,
        take: limit,
        orderBy: {
          [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
        },
      }),
      this.kbRepository.count({
        search: query.search,
        tag: query.tag,
        language: query.language,
        status: query.status,
      }),
    ]);

    return {
      items: items.map((item: RawKbArticle) => this.kbMapper.toArticleEntity(item)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const article = await this.kbRepository.findById(id);

    if (!article) {
      throw new NotFoundException('Knowledge base article not found');
    }

    return this.kbMapper.toArticleEntity(article);
  }

  async update(id: string, updateKbArticleDto: UpdateKbArticleDto) {
    await this.ensureArticleExists(id);

    const article = await this.kbRepository.updateArticle(id, {
      title: updateKbArticleDto.title,
      slug: updateKbArticleDto.slug ?? null,
      summary: updateKbArticleDto.summary ?? null,
      content: updateKbArticleDto.content,
      language: updateKbArticleDto.language ?? null,
      sourceUrl: updateKbArticleDto.sourceUrl ?? null,
      tags: updateKbArticleDto.tags,
      metadata: updateKbArticleDto.metadata ?? null,
    });

    return this.kbMapper.toArticleEntity(article);
  }

  async publish(id: string, publishKbArticleDto: PublishKbArticleDto) {
    await this.ensureArticleExists(id);

    const published = publishKbArticleDto.published ?? true;

    const article = await this.kbRepository.updateArticle(id, {
      status: published ? 'published' : 'draft',
      publishedAt: published
        ? publishKbArticleDto.publishedAt
          ? new Date(publishKbArticleDto.publishedAt)
          : new Date()
        : null,
    });

    return this.kbMapper.toArticleEntity(article);
  }

  async remove(id: string) {
    await this.ensureArticleExists(id);
    await this.kbRepository.deleteArticle(id);

    return {
      message: 'Knowledge base article deleted successfully',
    };
  }

  async ingest(ingestKbSourceDto: IngestKbSourceDto) {
    if (ingestKbSourceDto.sourceType === 'file') {
      throw new BadRequestException('File ingestion is not supported yet');
    }

    const ingestionResult = await this.ingestionService.ingest({
      sourceType:
        ingestKbSourceDto.sourceType === 'url'
          ? IngestionSourceType.URL
          : IngestionSourceType.TEXT,
      title: ingestKbSourceDto.title,
      url: ingestKbSourceDto.sourceUrl,
      content: ingestKbSourceDto.rawContent,
      language: ingestKbSourceDto.language,
      tags: ingestKbSourceDto.tags,
      metadata: ingestKbSourceDto.metadata,
      chunkSize: ingestKbSourceDto.chunkSize,
      chunkOverlap: ingestKbSourceDto.chunkOverlap,
    });

    const article = await this.kbRepository.createArticle({
      title: ingestionResult.title ?? ingestKbSourceDto.title ?? 'Untitled article',
      slug: null,
      summary: null,
      content: ingestionResult.content,
      language: ingestKbSourceDto.language ?? null,
      sourceUrl: ingestKbSourceDto.sourceUrl ?? null,
      tags: ingestKbSourceDto.tags ?? [],
      metadata: ingestionResult.metadata ?? null,
      status: ingestKbSourceDto.autoPublish ? 'published' : 'draft',
      publishedAt: ingestKbSourceDto.autoPublish ? new Date() : null,
    });

    if (ingestionResult.chunks.length > 0) {
      await this.kbRepository.createChunks(
        article.id,
        ingestionResult.chunks.map((chunk: RawKbChunk) => ({
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          embedding: chunk.embedding,
          metadata: chunk.metadata ?? null,
        })),
      );
    }

    const createdArticle = await this.kbRepository.findById(article.id);

    if (!createdArticle) {
      throw new NotFoundException('Created article not found');
    }

    return this.kbMapper.toArticleEntity(createdArticle);
  }

  private async ensureArticleExists(id: string) {
    const article = await this.kbRepository.findById(id);

    if (!article) {
      throw new NotFoundException('Knowledge base article not found');
    }

    return article;
  }
}