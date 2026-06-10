import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
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
import { ReviewKbSuggestionDto } from './dto/review-kb-suggestion.dto';
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
  private readonly logger = new Logger(KbArticlesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kbRepository: KbRepository,
    private readonly kbMapper: KbMapper,
    private readonly ingestionService: IngestionService,
  ) {}

  private async resolveRequiredCompanyId(
    actor: AuthenticatedUser | undefined,
    requestedCompanyId?: string | null,
    action = 'knowledge_base',
  ): Promise<string> {
    const actorCompanyId = resolveCompanyScope(actor);
    const requested = requestedCompanyId?.trim() || null;

    if (actorCompanyId) {
      if (requested && requested !== actorCompanyId) {
        throw new BadRequestException(
          'companyId is resolved from the authenticated user',
        );
      }

      return actorCompanyId;
    }

    if (!requested) {
      throw new BadRequestException(
        'companyId is required for strict multi-company knowledge base operations',
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: requested },
      select: { id: true, name: true, isActive: true, status: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found for knowledge base operation');
    }

    this.logger.log(
      `KB_COMPANY_SCOPE action=${action} companyId=${company.id} companyName=${company.name} status=${company.status} isActive=${company.isActive}`,
    );

    return company.id;
  }

  async create(
    createKbArticleDto: CreateKbArticleDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      createKbArticleDto.companyId,
      'create_article',
    );
    const article = await this.kbRepository.createArticle({
      companyId,
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

    await this.reindexArticle(article.id);

    const indexedArticle = await this.kbRepository.findById(article.id);

    return this.kbMapper.toArticleEntity((indexedArticle ?? article) as RawKbArticle);
  }

  async findAll(query: KbArticleQueryDto, actor?: AuthenticatedUser) {
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      query.companyId,
      'list_articles',
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.kbRepository.findMany({
        companyId,
        search: query.search,
        tag: query.tag,
        language: query.language,
        status: query.status,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      }),
      this.kbRepository.count({
        companyId,
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

  async findOne(id: string, actor?: AuthenticatedUser) {
    const article = await this.kbRepository.findById(
      id,
      resolveCompanyScope(actor),
    );

    if (!article) {
      throw new NotFoundException('Knowledge base article not found');
    }

    return this.kbMapper.toArticleEntity(article as RawKbArticle);
  }

  async update(
    id: string,
    updateKbArticleDto: UpdateKbArticleDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = resolveCompanyScope(actor);
    await this.ensureArticleExists(id, companyId);

    const article = await this.kbRepository.updateArticle(id, {
      title: updateKbArticleDto.title,
      body: updateKbArticleDto.content,
      language: updateKbArticleDto.language,
      sourceUrl: updateKbArticleDto.sourceUrl,
      tags: updateKbArticleDto.tags,
      category: updateKbArticleDto.summary,
    });

    await this.reindexArticle(id);

    const indexedArticle = await this.kbRepository.findById(id);

    return this.kbMapper.toArticleEntity((indexedArticle ?? article) as RawKbArticle);
  }

  async publish(
    id: string,
    publishKbArticleDto: PublishKbArticleDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = resolveCompanyScope(actor);
    await this.ensureArticleExists(id, companyId);

    const published = publishKbArticleDto.published ?? true;

    const article = await this.kbRepository.updateArticle(id, {
      status: published ? 'published' : 'draft',
      publishedAt: published
        ? publishKbArticleDto.publishedAt
          ? new Date(publishKbArticleDto.publishedAt)
          : new Date()
        : null,
    });

    await this.reindexArticle(id);

    const indexedArticle = await this.kbRepository.findById(id);

    return this.kbMapper.toArticleEntity((indexedArticle ?? article) as RawKbArticle);
  }

  async remove(id: string, actor?: AuthenticatedUser) {
    await this.ensureArticleExists(id, resolveCompanyScope(actor));
    await this.kbRepository.deleteArticle(id);

    return {
      message: 'Knowledge base article deleted successfully',
    };
  }

  async learnFromHumanResponse(
    dto: LearnFromHumanResponseDto,
    actor?: AuthenticatedUser,
  ) {
    const customerQuestion = dto.customerQuestion.trim();
    const humanAnswer = dto.humanAnswer.trim();

    if (!customerQuestion || !humanAnswer) {
      throw new BadRequestException(
        'customerQuestion and humanAnswer are required.',
      );
    }

    const customerMessageId = dto.customerMessageId?.trim() ?? null;
    const humanAnswerMessageId = dto.humanAnswerMessageId?.trim() ?? null;

    if (!customerMessageId || !humanAnswerMessageId) {
      throw new BadRequestException(
        'customerMessageId and humanAnswerMessageId are required for KB suggestions.',
      );
    }

    const companyId = await this.resolveRequiredCompanyId(
      actor,
      dto.companyId,
      'learn_from_human_response',
    );

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: dto.conversationId,
        companyId,
        ...(dto.contactId ? { contactId: dto.contactId } : {}),
      },
      select: { id: true, contactId: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found for this company.');
    }

    const customerMessage = await this.prisma.message.findFirst({
      where: {
        id: customerMessageId,
        conversationId: conversation.id,
        companyId,
        direction: 'inbound',
      },
      select: { id: true },
    });
    const humanAnswerMessage = await this.prisma.message.findFirst({
      where: {
        id: humanAnswerMessageId,
        conversationId: conversation.id,
        companyId,
        direction: 'outbound',
      },
      select: { id: true },
    });
    if (!customerMessage || !humanAnswerMessage) {
      throw new NotFoundException('Messages not found for this company conversation.');
    }

    const alreadyExists = await this.prisma.kbSuggestion.findFirst({
      where: { humanAnswerMessageId, companyId },
      select: { id: true },
    });

    if (alreadyExists) {
      return {
        suggestionId: alreadyExists.id,
        status: 'pending',
        duplicate: true,
      };
    }

    const suggestion = await this.prisma.kbSuggestion.create({
      data: {
        companyId,
        conversationId: dto.conversationId,
        customerMessageId,
        humanAnswerMessageId,
        question: customerQuestion,
        answer: humanAnswer,
        status: 'pending',
        reviewedBy: null,
        createdBy: dto.createdBy ?? null,
        createdAt: new Date(),
        reviewedAt: null,
      },
    });

    await this.prisma.notification.create({
      data: {
        companyId,
        conversationId: dto.conversationId,
        contactId: dto.contactId ?? conversation.contactId,
        type: NotificationType.KB_DRAFT_SUGGESTION,
        title: 'KB suggestion pending review',
        message: 'A human answer was saved as a pending KB suggestion.',
        priority: NotificationPriority.medium,
        isRead: false,
      },
    });

    return {
      suggestionId: suggestion.id,
      status: suggestion.status,
      question: suggestion.question,
      answer: suggestion.answer,
      duplicate: false,
    };
  }

  async findSuggestions(params?: {
    companyId?: string;
    status?: 'pending' | 'approved' | 'rejected';
    actor?: AuthenticatedUser;
  }) {
    const companyId = await this.resolveRequiredCompanyId(
      params?.actor,
      params?.companyId,
      'list_suggestions',
    );
    const rows = await this.prisma.kbSuggestion.findMany({
      where: {
        companyId,
        ...(params?.status ? { status: params.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customerMessage: {
          select: { id: true, content: true },
        },
        humanAnswerMessage: {
          select: { id: true, content: true },
        },
      },
    });

    return rows.map((item) => ({
      id: item.id,
      companyId: item.companyId,
      conversationId: item.conversationId,
      customerMessageId: item.customerMessageId,
      humanAnswerMessageId: item.humanAnswerMessageId,
      question: item.question,
      answer: item.answer,
      status: item.status,
      reviewedBy: item.reviewedBy,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      reviewedAt: item.reviewedAt,
      customerMessage: item.customerMessage.content,
      humanAnswerMessage: item.humanAnswerMessage.content,
    }));
  }

  async approveSuggestion(
    id: string,
    dto: ReviewKbSuggestionDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = resolveCompanyScope(actor);
    const suggestion = await this.prisma.kbSuggestion.findUnique({
      where: { id },
      include: {
        conversation: {
          select: {
            id: true,
            contactId: true,
          },
        },
      },
    });

    if (!suggestion) {
      throw new NotFoundException('KB suggestion not found');
    }

    const suggestionCompanyId = suggestion.companyId?.trim();

    if (!suggestionCompanyId) {
      throw new BadRequestException('KB suggestion is not linked to a company');
    }

    if (companyId && suggestionCompanyId !== companyId) {
      throw new NotFoundException('KB suggestion not found');
    }

    if (suggestion.status === 'approved') {
      return {
        suggestionId: suggestion.id,
        status: suggestion.status,
        reviewedBy: suggestion.reviewedBy,
        reviewedAt: suggestion.reviewedAt,
        articleId: null,
        alreadyApproved: true,
      };
    }

    const reviewedAt = new Date();
    const approved = await this.prisma.kbSuggestion.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedBy: dto.reviewedBy ?? null,
        reviewedAt,
      },
    });

    const article = await this.kbRepository.createArticle({
      companyId: suggestionCompanyId,
      title: suggestion.question.slice(0, 220),
      body: `Customer question:\n${suggestion.question}\n\nHuman answer:\n${suggestion.answer}`,
      category: dto.category?.trim() || 'agent-learning',
      tags: dto.tags ?? [],
      language: dto.language ?? 'fr',
      status: 'published',
      source: 'human_agent_response',
      sourceConversationId: suggestion.conversationId,
      sourceContactId: suggestion.conversation.contactId,
      createdBy: suggestion.createdBy,
      publishedAt: reviewedAt,
      sourceUrl: null,
    });

    await this.reindexArticle(article.id);

    this.logger.log(
      `KB_SUGGESTION_APPROVED companyId=${suggestionCompanyId} suggestionId=${suggestion.id} articleId=${article.id}`,
    );

    return {
      suggestionId: approved.id,
      status: approved.status,
      reviewedBy: approved.reviewedBy,
      reviewedAt: approved.reviewedAt,
      articleId: article.id,
    };
  }

  async rejectSuggestion(
    id: string,
    dto: ReviewKbSuggestionDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = resolveCompanyScope(actor);
    const suggestion = await this.prisma.kbSuggestion.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });

    if (!suggestion) {
      throw new NotFoundException('KB suggestion not found');
    }

    const suggestionCompanyId = suggestion.companyId?.trim();

    if (!suggestionCompanyId) {
      throw new BadRequestException('KB suggestion is not linked to a company');
    }

    if (companyId && suggestionCompanyId !== companyId) {
      throw new NotFoundException('KB suggestion not found');
    }

    const rejected = await this.prisma.kbSuggestion.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy: dto.reviewedBy ?? null,
        reviewedAt: new Date(),
      },
    });

    this.logger.log(
      `KB_SUGGESTION_REJECTED companyId=${suggestionCompanyId} suggestionId=${suggestion.id}`,
    );

    return {
      suggestionId: rejected.id,
      status: rejected.status,
      reviewedBy: rejected.reviewedBy,
      reviewedAt: rejected.reviewedAt,
    };
  }

  async findDrafts(companyId?: string, actor?: AuthenticatedUser) {
    const scopedCompanyId = await this.resolveRequiredCompanyId(
      actor,
      companyId,
      'list_drafts',
    );
    const items = await this.kbRepository.findMany({
      status: 'draft',
      companyId: scopedCompanyId,
      skip: 0,
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item: RawKbArticle) =>
      this.kbMapper.toArticleEntity(item as RawKbArticle),
    );
  }

  async reject(id: string, actor?: AuthenticatedUser) {
    const companyId = resolveCompanyScope(actor);
    await this.ensureArticleExists(id, companyId);

    const article = await this.kbRepository.updateArticle(id, {
      status: 'rejected',
    });

    return this.kbMapper.toArticleEntity(article as RawKbArticle);
  }

  async ingest(
    ingestKbSourceDto: IngestKbSourceDto,
    actor?: AuthenticatedUser,
  ) {
    if (ingestKbSourceDto.sourceType === 'file') {
      throw new BadRequestException('File ingestion is not supported yet');
    }

    const companyId = await this.resolveRequiredCompanyId(
      actor,
      ingestKbSourceDto.companyId,
      'ingest_source',
    );

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
      companyId,
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
    actor?: AuthenticatedUser,
  ) {
    const sourceType = this.resolveIngestionFileType(file.originalname, file.mimetype);

    const companyId = await this.resolveRequiredCompanyId(
      actor,
      ingestKbFileDto.companyId,
      'ingest_file',
    );

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
      companyId,
      title: ingestKbFileDto.title,
      language: ingestKbFileDto.language,
      sourceUrl: null,
      tags: ingestKbFileDto.tags,
      autoPublish: ingestKbFileDto.autoPublish,
      summary: ingestKbFileDto.summary ?? null,
      sourceType: sourceType.toLowerCase(),
    });
  }

  async reindexArticle(articleId: string) {
    const article = await this.kbRepository.findById(articleId);

    if (!article) {
      throw new NotFoundException('Knowledge base article not found');
    }

    if (!article.companyId?.trim()) {
      throw new BadRequestException(
        'Knowledge base article is not linked to a company',
      );
    }

    await this.kbRepository.deleteChunksByArticleId(article.id);

    const content = [article.title, article.body].filter(Boolean).join('\n\n');

    if (!content.trim()) {
      return {
        articleId: article.id,
        companyId: article.companyId,
        chunksIndexed: 0,
      };
    }

    const tags = this.toStringList(article.tags);
    const ingestionResult = await this.ingestionService.ingest({
      sourceType: IngestionSourceType.TEXT,
      title: article.title ?? undefined,
      content,
      language: article.language ?? undefined,
      tags,
      chunkSize: 2400,
      chunkOverlap: 240,
      metadata: {
        language: article.language,
        category: article.category,
        tags,
        product: null,
        companyId: article.companyId,
        articleId: article.id,
        indexedAt: new Date().toISOString(),
      },
    });

    await this.kbRepository.createChunks(
      article.id,
      ingestionResult.chunks.map((chunk: RawKbChunkInput) => ({
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        embedding: chunk.embedding ?? null,
        metadata: {
          ...(chunk.metadata ?? {}),
          language: article.language,
          category: article.category,
          tags,
          product: null,
          companyId: article.companyId,
          articleId: article.id,
        },
      })),
      article.companyId,
    );

    return {
      articleId: article.id,
      companyId: article.companyId,
      chunksIndexed: ingestionResult.chunks.length,
    };
  }

  async reindexCompanyKb(companyId: string) {
    const articles = await this.kbRepository.findMany({
      companyId,
      skip: 0,
      take: 10000,
      orderBy: { updatedAt: 'desc' },
    });
    const results = [];

    for (const article of articles) {
      results.push(await this.reindexArticle(article.id));
    }

    return {
      companyId,
      articlesIndexed: results.length,
      chunksIndexed: results.reduce(
        (sum, result) => sum + result.chunksIndexed,
        0,
      ),
    };
  }

  private async ensureArticleExists(id: string, companyId?: string) {
    const article = await this.kbRepository.findById(id, companyId);

    if (!article) {
      throw new NotFoundException('Knowledge base article not found');
    }

    if (!article.companyId?.trim()) {
      throw new BadRequestException(
        'Knowledge base article is not linked to a company',
      );
    }

    return article;
  }

  private toStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
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
      companyId: string;
      title?: string | null;
      language?: string | null;
      sourceUrl?: string | null;
      tags?: string[];
      autoPublish?: boolean;
      summary?: string | null;
      sourceType: string;
    },
  ) {
    const shouldPublish = input.autoPublish ?? true;

    const article = await this.kbRepository.createArticle({
      companyId: input.companyId,
      title: ingestionResult.title ?? input.title ?? 'Untitled article',
      body: ingestionResult.content,
      language: input.language ?? null,
      sourceUrl: input.sourceUrl ?? null,
      tags: input.tags ?? [],
      status: shouldPublish ? 'published' : 'draft',
      source: 'imported',
      createdBy: null,
      publishedAt: shouldPublish ? new Date() : null,
      category: input.summary ?? null,
    });

    if (ingestionResult.chunks.length > 0) {
      await this.kbRepository.createChunks(
        article.id,
        ingestionResult.chunks.map((chunk: RawKbChunkInput) => ({
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          embedding: chunk.embedding ?? null,
          metadata: {
            ...(chunk.metadata ?? {}),
            companyId: input.companyId,
            articleId: article.id,
          },
        })),
        input.companyId,
      );
    }

    const createdArticle = await this.kbRepository.findById(article.id);

    if (!createdArticle) {
      throw new NotFoundException('Created article not found');
    }

    return this.kbMapper.toArticleEntity(createdArticle as RawKbArticle);
  }
}
