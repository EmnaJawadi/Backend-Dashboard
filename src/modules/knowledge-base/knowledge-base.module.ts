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
import { StructuredDataParser } from './ingestion/parsers/structured-data.parser';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AiModule } from '../ai/ai.module';
import { PdfStructureAnalyzerService } from './pdf-structure-analyzer.service';
import { PdfImportRepository } from './pdf-import.repository';
import { PdfImportService } from './pdf-import.service';
import { PdfImportController } from './pdf-import.controller';
import { FileSecurityService } from './ingestion/file-security.service';
import { OpenAiCompatibleEmbeddingProvider } from './ingestion/openai-compatible-embedding.provider';
import { GeminiEmbeddingProvider } from './ingestion/gemini-embedding.provider';

@Module({
  imports: [AiModule],
  controllers: [KbArticlesController, KnowledgeBaseWorkflowController, PdfImportController],
  providers: [
    PrismaService,
    KbRepository,
    KbMapper,
    KbArticlesService,
    KbChunksService,
    ChunkerService,
    OpenAiCompatibleEmbeddingProvider,
    GeminiEmbeddingProvider,
    EmbeddingsService,
    IngestionService,
    UrlParser,
    PdfParser,
    DocParser,
    PptParser,
    StructuredDataParser,
    FileSecurityService,
    PdfStructureAnalyzerService,
    PdfImportRepository,
    PdfImportService,
  ],
  exports: [KbArticlesService, KbChunksService],
})
export class KnowledgeBaseModule {}
