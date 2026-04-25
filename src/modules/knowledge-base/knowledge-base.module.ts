import { Module } from '@nestjs/common';
import { KbArticlesController } from './kb-articles.controller';
import { KbArticlesService } from './kb-articles.service';
import { KbChunksService } from './kb-chunks.service';
import { KbRepository } from './kb.repository';
import { KbMapper } from './mappers/kb.mapper';
import { KnowledgeBaseWorkflowController } from './knowledge-base-workflow.controller';
import { ChunkerService } from './ingestion/chunker.service';
import { EmbeddingsService } from './ingestion/embeddings.service';
import { IngestionService } from './ingestion/ingestion.service';
import { UrlParser } from './ingestion/parsers/url.parser';
import { PdfParser } from './ingestion/parsers/pdf.parser';
import { DocParser } from './ingestion/parsers/doc.parser';
import { PptParser } from './ingestion/parsers/ppt.parser';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [KbArticlesController, KnowledgeBaseWorkflowController],
  providers: [
    PrismaService,
    KbRepository,
    KbMapper,
    KbArticlesService,
    KbChunksService,
    ChunkerService,
    EmbeddingsService,
    IngestionService,
    UrlParser,
    PdfParser,
    DocParser,
    PptParser,
  ],
  exports: [KbArticlesService, KbChunksService],
})
export class KnowledgeBaseModule {}
