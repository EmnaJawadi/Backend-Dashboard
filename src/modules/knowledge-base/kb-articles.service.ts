import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { PublishKbArticleDto } from './dto/publish-kb-article.dto';
import { KbArticleQueryDto } from './dto/kb-article-query.dto';
import { IngestKbFileDto } from './dto/ingest-kb-file.dto';
import { IngestKbSourceDto } from './dto/ingest-kb-source.dto';
import { KbRepository } from './kb.repository';
import { KbMapper } from './mappers/kb.mapper';
import {
  IngestionService,
  IngestionSourceType,
} from './ingestion/ingestion.service';

type RawKbChunkInput = {
  content: string;
  chunkIndex: number;
  embedding?: number[] | null;
  metadata?: Record<string, unknown> | null;
};

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
  chunks?: Array<{
    id: string;
    articleId: string;
    chunkText: string | null;
    chunkIndex: number;
    embeddingsVector?: Uint8Array | null;
    metadataJson?: unknown;
    createdAt?: Date | string;
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
      body: createKbArticleDto.content,
      lang: createKbArticleDto.language ?? null,
      sourceUrl: createKbArticleDto.sourceUrl ?? null,
      tags: createKbArticleDto.tags ?? [],
      status: 'draft',
      publishedAt: null,
      category: createKbArticleDto.summary ?? null,
      version: 1,
      sourceTypes: null,
      authorId: null,
    });

    return this.kbMapper.toArticleEntity(article as RawKbArticle);
  }

  async findAll(query: KbArticleQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.kbRepository.findMany({
        search: query.search,
        tag: query.tag,
        lang: query.language,
        status: query.status,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      }),
      this.kbRepository.count({
        search: query.search,
        tag: query.tag,
        lang: query.language,
        status: query.status,
      }),
    ]);

    return {
      items: items.map((item: RawKbArticle) =>
        this.kbMapper.toArticleEntity(item as RawKbArticle),
      ),
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

    return this.kbMapper.toArticleEntity(article as RawKbArticle);
  }

  async update(id: string, updateKbArticleDto: UpdateKbArticleDto) {
    await this.ensureArticleExists(id);

    const article = await this.kbRepository.updateArticle(id, {
      title: updateKbArticleDto.title,
      body: updateKbArticleDto.content,
      lang: updateKbArticleDto.language,
      sourceUrl: updateKbArticleDto.sourceUrl,
      tags: updateKbArticleDto.tags,
      category: updateKbArticleDto.summary,
    });

    return this.kbMapper.toArticleEntity(article as RawKbArticle);
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

    return this.kbMapper.toArticleEntity(article as RawKbArticle);
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

    return this.createArticleFromIngestionResult(ingestionResult, {
      title: ingestKbSourceDto.title,
      language: ingestKbSourceDto.language,
      sourceUrl: ingestKbSourceDto.sourceUrl,
      tags: ingestKbSourceDto.tags,
      autoPublish: ingestKbSourceDto.autoPublish,
      summary: null,
      sourceType: ingestKbSourceDto.sourceType,
    });
  }

  async ingestFile(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    ingestKbFileDto: IngestKbFileDto,
  ) {
    const sourceType = this.resolveIngestionFileType(file.originalname, file.mimetype);

    const ingestionResult = await this.ingestionService.ingest({
      sourceType,
      fileBuffer: file.buffer,
      filename: file.originalname,
      title: ingestKbFileDto.title,
      language: ingestKbFileDto.language,
      tags: ingestKbFileDto.tags,
      chunkSize: ingestKbFileDto.chunkSize,
      chunkOverlap: ingestKbFileDto.chunkOverlap,
    });

    return this.createArticleFromIngestionResult(ingestionResult, {
      title: ingestKbFileDto.title,
      language: ingestKbFileDto.language,
      sourceUrl: null,
      tags: ingestKbFileDto.tags,
      autoPublish: ingestKbFileDto.autoPublish,
      summary: ingestKbFileDto.summary ?? null,
      sourceType: sourceType.toLowerCase(),
    });
  }

  private async ensureArticleExists(id: string) {
    const article = await this.kbRepository.findById(id);

    if (!article) {
      throw new NotFoundException('Knowledge base article not found');
    }

    return article;
  }

  private resolveIngestionFileType(
    filename: string,
    mimetype: string,
  ): IngestionSourceType {
    const lowerName = filename.toLowerCase();
    const lowerMime = (mimetype ?? '').toLowerCase();

    if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) {
      return IngestionSourceType.PDF;
    }

    if (
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.doc') ||
      lowerMime.includes('wordprocessingml') ||
      lowerMime.includes('msword')
    ) {
      return IngestionSourceType.DOC;
    }

    if (
      lowerName.endsWith('.pptx') ||
      lowerName.endsWith('.ppt') ||
      lowerMime.includes('presentationml') ||
      lowerMime.includes('powerpoint')
    ) {
      return IngestionSourceType.PPT;
    }

    throw new BadRequestException(
      'Unsupported file type. Allowed: PDF, DOC/DOCX, PPT/PPTX',
    );
  }

  private async createArticleFromIngestionResult(
    ingestionResult: Awaited<ReturnType<IngestionService['ingest']>>,
    input: {
      title?: string | null;
      language?: string | null;
      sourceUrl?: string | null;
      tags?: string[];
      autoPublish?: boolean;
      summary?: string | null;
      sourceType: string;
    },
  ) {
    const article = await this.kbRepository.createArticle({
      title: ingestionResult.title ?? input.title ?? 'Untitled article',
      body: ingestionResult.content,
      lang: input.language ?? null,
      sourceUrl: input.sourceUrl ?? null,
      tags: input.tags ?? [],
      status: input.autoPublish ? 'published' : 'draft',
      publishedAt: input.autoPublish ? new Date() : null,
      category: input.summary ?? null,
      version: 1,
      sourceTypes: this.normalizeSourceTypeForDatabase(input.sourceType),
      authorId: null,
    });

    if (ingestionResult.chunks.length > 0) {
      await this.kbRepository.createChunks(
        article.id,
        ingestionResult.chunks.map((chunk: RawKbChunkInput) => ({
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          embedding: chunk.embedding ?? null,
          metadata: chunk.metadata ?? null,
        })),
      );
    }

    const createdArticle = await this.kbRepository.findById(article.id);

    if (!createdArticle) {
      throw new NotFoundException('Created article not found');
    }

    return this.kbMapper.toArticleEntity(createdArticle as RawKbArticle);
  }

  private normalizeSourceTypeForDatabase(sourceType: string): string {
    const normalized = sourceType.toLowerCase();

    if (normalized === 'url' || normalized === 'text' || normalized === 'pdf' || normalized === 'doc') {
      return normalized;
    }

    if (normalized === 'ppt') {
      // Backward-compatible with existing DB check constraint.
      return 'doc';
    }

    return 'text';
  }
}
