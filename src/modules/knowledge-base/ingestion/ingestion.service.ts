import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ChunkerService } from './chunker.service';
import { EmbeddingsService } from './embeddings.service';
import { UrlParser } from './parsers/url.parser';
import { PdfParser } from './parsers/pdf.parser';
import { DocParser } from './parsers/doc.parser';
import { PptParser } from './parsers/ppt.parser';
import { StructuredDataParser } from './parsers/structured-data.parser';

export enum IngestionSourceType {
  TEXT = 'text',
  URL = 'url',
  PDF = 'pdf',
  DOC = 'doc',
  PPT = 'ppt',
  JSON = 'json',
  YAML = 'yaml',
}

export interface IngestSourceInput {
  sourceType: IngestionSourceType;
  title?: string;
  content?: string;
  url?: string;
  fileBuffer?: Buffer;
  filename?: string;
  language?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  chunkSize?: number;
  chunkOverlap?: number;
  contextPrefix?: string;
  generateEmbeddings?: boolean;
}

export interface IngestedChunkResult {
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface IngestionResult {
  title?: string;
  content: string;
  chunks: IngestedChunkResult[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly chunkerService: ChunkerService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly urlParser: UrlParser,
    private readonly pdfParser: PdfParser,
    private readonly docParser: DocParser,
    private readonly pptParser: PptParser,
    private readonly structuredDataParser: StructuredDataParser,
  ) {}

  async ingest(source: IngestSourceInput): Promise<IngestionResult> {
    const parsed = await this.extractContent(source);

    const chunks = this.chunkerService.chunkText(
      parsed.content,
      source.chunkSize ?? 1000,
      source.chunkOverlap ?? 100,
      source.contextPrefix,
    );

    const embeddings =
      source.generateEmbeddings === false
        ? chunks.map(() => [])
        : await this.embeddingsService.generateEmbeddings(
            chunks.map((chunk) => chunk.content),
          );

    const resultChunks: IngestedChunkResult[] = chunks.map((chunk, index) => ({
      chunkIndex: chunk.index,
      content: chunk.content,
      embedding: embeddings[index] ?? [],
      metadata: {
        start: chunk.start,
        end: chunk.end,
        ...(chunk.metadata ?? {}),
      },
    }));

    this.logger.log(`Ingestion completed with ${resultChunks.length} chunks`);

    return {
      title: parsed.title ?? source.title,
      content: parsed.content,
      chunks: resultChunks,
      metadata: {
        language: source.language ?? null,
        tags: source.tags ?? [],
        ...source.metadata,
        ...parsed.metadata,
      },
    };
  }

  private async extractContent(
    source: IngestSourceInput,
  ): Promise<{ title?: string; content: string; metadata?: Record<string, unknown> }> {
    switch (source.sourceType) {
      case IngestionSourceType.TEXT:
        if (!source.content?.trim()) {
          throw new BadRequestException('Content is required for text ingestion');
        }

        return {
          title: source.title,
          content: source.content.trim(),
          metadata: {
            sourceType: IngestionSourceType.TEXT,
          },
        };

      case IngestionSourceType.URL:
        if (!source.url?.trim()) {
          throw new BadRequestException('URL is required for URL ingestion');
        }

        return this.urlParser.parse(source.url);

      case IngestionSourceType.PDF:
        if (!source.fileBuffer) {
          throw new BadRequestException('PDF file buffer is required');
        }

        return {
          title: source.title ?? source.filename,
          content: await this.pdfParser.parse(source.fileBuffer, source.filename),
          metadata: {
            sourceType: IngestionSourceType.PDF,
            filename: source.filename,
          },
        };

      case IngestionSourceType.DOC:
        if (!source.fileBuffer) {
          throw new BadRequestException('DOC file buffer is required');
        }

        return {
          title: source.title ?? source.filename,
          content: await this.docParser.parse(source.fileBuffer, source.filename),
          metadata: {
            sourceType: IngestionSourceType.DOC,
            filename: source.filename,
          },
        };

      case IngestionSourceType.PPT:
        if (!source.fileBuffer) {
          throw new BadRequestException('PPT file buffer is required');
        }

        return {
          title: source.title ?? source.filename,
          content: await this.pptParser.parse(source.fileBuffer, source.filename),
          metadata: {
            sourceType: IngestionSourceType.PPT,
            filename: source.filename,
          },
        };

      case IngestionSourceType.JSON:
      case IngestionSourceType.YAML:
        if (!source.fileBuffer) {
          throw new BadRequestException(
            `${source.sourceType.toUpperCase()} file buffer is required`,
          );
        }

        return {
          title: source.title ?? source.filename,
          content: this.structuredDataParser.parse(
            source.fileBuffer,
            source.sourceType,
            source.filename,
          ),
          metadata: {
            sourceType: source.sourceType,
            filename: source.filename,
          },
        };

      default:
        throw new BadRequestException('Unsupported ingestion source type');
    }
  }
}
