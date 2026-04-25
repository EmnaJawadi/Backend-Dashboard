import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  NotificationPriority,
  NotificationType,
} from '../../generated/prisma/client';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { PublishKbArticleDto } from './dto/publish-kb-article.dto';
import { KbArticleQueryDto } from './dto/kb-article-query.dto';
import { IngestKbFileDto } from './dto/ingest-kb-file.dto';
import { IngestKbSourceDto } from './dto/ingest-kb-source.dto';
import { LearnFromHumanResponseDto } from './dto/learn-from-human-response.dto';
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
  language?: string | null;
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
    private readonly prisma: PrismaService,
    private readonly kbRepository: KbRepository,
    private readonly kbMapper: KbMapper,
    private readonly ingestionService: IngestionService,
  ) {}

  async create(createKbArticleDto: CreateKbArticleDto) {
    const article = await this.kbRepository.createArticle({
      title: createKbArticleDto.title,
      body: createKbArticleDto.content,
      language: createKbArticleDto.language ?? null,
      sourceUrl: createKbArticleDto.sourceUrl ?? null,
      tags: createKbArticleDto.tags ?? [],
      status: 'draft',
      source: 'manual',
      createdBy: null,
      publishedAt: null,
      category: createKbArticleDto.summary ?? null,
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
        language: query.language,
        status: query.status,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      }),
      this.kbRepository.count({
        search: query.search,
        tag: query.tag,
        language: query.language,
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
      language: updateKbArticleDto.language,
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

  async learnFromHumanResponse(dto: LearnFromHumanResponseDto) {
    const customerQuestion = dto.customerQuestion.trim();
    const humanAnswer = dto.humanAnswer.trim();

    if (!customerQuestion || !humanAnswer) {
      throw new BadRequestException(
        'customerQuestion and humanAnswer are required.',
      );
    }

    const article = await this.kbRepository.createArticle({
      companyId: dto.companyId,
      title: customerQuestion.slice(0, 220),
      body: `Customer question:\n${customerQuestion}\n\nHuman answer:\n${humanAnswer}`,
      category: dto.suggestedCategory?.trim() || 'agent-learning',
      tags: dto.suggestedTags ?? [],
      language: dto.language ?? 'fr',
      status: 'draft',
      source: 'human_agent_response',
      sourceConversationId: dto.conversationId,
      sourceContactId: dto.contactId,
      createdBy: dto.createdBy ?? null,
      publishedAt: null,
      sourceUrl: null,
    });

    await this.prisma.notification.create({
      data: {
        companyId: dto.companyId,
        conversationId: dto.conversationId,
        contactId: dto.contactId,
        type: NotificationType.KB_DRAFT_SUGGESTION,
        title: 'KB draft suggestion created',
        message: 'A human response was converted to a draft KB article.',
        priority: NotificationPriority.medium,
        isRead: false,
      },
    });

    return this.kbMapper.toArticleEntity(article as RawKbArticle);
  }

  async findDrafts(companyId?: string) {
    const items = await this.kbRepository.findMany({
      status: 'draft',
      companyId: companyId ?? undefined,
      skip: 0,
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item: RawKbArticle) =>
      this.kbMapper.toArticleEntity(item as RawKbArticle),
    );
  }

  async reject(id: string) {
    await this.ensureArticleExists(id);

    const article = await this.kbRepository.updateArticle(id, {
      status: 'rejected',
    });

    return this.kbMapper.toArticleEntity(article as RawKbArticle);
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
      language: input.language ?? null,
      sourceUrl: input.sourceUrl ?? null,
      tags: input.tags ?? [],
      status: input.autoPublish ? 'published' : 'draft',
      source: 'imported',
      createdBy: null,
      publishedAt: input.autoPublish ? new Date() : null,
      category: input.summary ?? null,
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
}
