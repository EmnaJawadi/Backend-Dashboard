import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { Retriever, RetrieverResult } from './retriever.interface';

type RawKbChunk = {
  id: string;
  content: string;
};

@Injectable()
export class PgvectorRetriever implements Retriever {
  constructor(private readonly prisma: PrismaService) {}

  async retrieve(query: string, topK: number): Promise<RetrieverResult[]> {
    const chunks = await this.prisma.kbChunk.findMany({
      take: topK,
      orderBy: { createdAt: 'desc' },
    });

    return chunks.map((c: RawKbChunk) => ({
      content: c.content,
      score: 0.5,
      metadata: { id: c.id },
    }));
  }
}