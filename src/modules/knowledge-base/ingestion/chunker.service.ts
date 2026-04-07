import { Injectable } from '@nestjs/common';

export interface TextChunk {
  index: number;
  content: string;
  start: number;
  end: number;
}

@Injectable()
export class ChunkerService {
  chunkText(text: string, chunkSize = 1000, chunkOverlap = 100): TextChunk[] {
    const normalized = text?.replace(/\s+/g, ' ').trim();

    if (!normalized) {
      return [];
    }

    if (chunkSize <= 0) {
      chunkSize = 1000;
    }

    if (chunkOverlap < 0) {
      chunkOverlap = 0;
    }

    if (chunkOverlap >= chunkSize) {
      chunkOverlap = Math.floor(chunkSize / 5);
    }

    const chunks: TextChunk[] = [];
    let start = 0;
    let index = 0;

    while (start < normalized.length) {
      const end = Math.min(start + chunkSize, normalized.length);
      const slice = normalized.slice(start, end).trim();

      if (slice) {
        chunks.push({
          index,
          content: slice,
          start,
          end,
        });
        index++;
      }

      if (end >= normalized.length) {
        break;
      }

      start = end - chunkOverlap;
    }

    return chunks;
  }
}