import { Injectable } from '@nestjs/common';

export interface TextChunk {
  index: number;
  content: string;
  start: number;
  end: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ChunkerService {
  chunkText(
    text: string,
    chunkSize = 1000,
    chunkOverlap = 100,
    contextPrefix = '',
  ): TextChunk[] {
    const normalized = this.normalizeDocument(text);

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

    const prefix = contextPrefix.replace(/\s+/g, ' ').trim();
    const bodySize = Math.max(120, chunkSize - (prefix ? prefix.length + 2 : 0));
    const tableExtraction = this.extractStructuredTableChunks(normalized, prefix);
    const sections = this.splitIntoSections(tableExtraction.narrativeText);
    const chunks: TextChunk[] = [...tableExtraction.chunks];
    let cursor = 0;

    for (const section of sections) {
      const sectionStart = normalized.indexOf(section, cursor);
      const safeStart = sectionStart >= 0 ? sectionStart : cursor;
      const slices = this.sliceSection(section, bodySize, chunkOverlap);

      for (const slice of slices) {
        const content = prefix ? `${prefix}\n\n${slice.content}` : slice.content;
        chunks.push({
          index: 0,
          content,
          start: safeStart + slice.start,
          end: safeStart + slice.end,
        });
      }

      cursor = safeStart + section.length;
    }

    return chunks.map((chunk, index) => ({ ...chunk, index }));
  }

  private extractStructuredTableChunks(
    text: string,
    prefix: string,
  ): { narrativeText: string; chunks: TextChunk[] } {
    const lines = text.split('\n');
    const chunks: TextChunk[] = [];
    const consumed = new Set<number>();
    let offset = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const delimiter = this.tableDelimiter(lines[index]);
      if (!delimiter) {
        offset += lines[index].length + 1;
        continue;
      }

      const headers = this.tableCells(lines[index], delimiter);
      if (!this.looksLikeStructuredHeader(headers)) {
        offset += lines[index].length + 1;
        continue;
      }

      const tableStart = offset;
      const headerIndex = index;
      consumed.add(index);
      if (delimiter === '|' && this.isMarkdownSeparator(lines[index + 1] ?? '')) {
        consumed.add(index + 1);
        index += 1;
      }

      while (index + 1 < lines.length) {
        const rowIndex = index + 1;
        if (this.tableDelimiter(lines[rowIndex]) !== delimiter) break;
        const values = this.tableCells(lines[rowIndex], delimiter);
        if (values.length < 2 || values.every((value) => !value)) break;
        consumed.add(rowIndex);
        index = rowIndex;

        const fields = Object.fromEntries(
          headers.map((header, cellIndex) => [header, values[cellIndex] ?? '']),
        );
        const metadata = this.tableRowMetadata(fields);
        const rowContent = this.tableRowContent(fields, metadata);
        if (rowContent) {
          chunks.push({
            index: 0,
            content: prefix ? `${prefix}\n\n${rowContent}` : rowContent,
            start: tableStart,
            end: tableStart + lines.slice(headerIndex, rowIndex + 1).join('\n').length,
            metadata: {
              kind: 'structured_table_row',
              fields,
              ...metadata,
            },
          });
        }
      }

      offset = lines.slice(0, index + 1).join('\n').length + 1;
    }

    return {
      narrativeText: lines
        .map((line, index) => (consumed.has(index) ? '' : line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
      chunks,
    };
  }

  private tableDelimiter(line: string): '|' | ';' | null {
    const pipeCells = line.split('|').filter((cell) => cell.trim()).length;
    if (pipeCells >= 3) return '|';
    const semicolonCells = line.split(';').filter((cell) => cell.trim()).length;
    return semicolonCells >= 3 ? ';' : null;
  }

  private tableCells(line: string, delimiter: '|' | ';'): string[] {
    const trimmed = delimiter === '|' ? line.replace(/^\s*\||\|\s*$/g, '') : line;
    return trimmed.split(delimiter).map((cell) => cell.trim());
  }

  private looksLikeStructuredHeader(headers: string[]): boolean {
    const normalized = headers.map((header) => this.normalizeKey(header));
    const known = normalized.filter((header) =>
      /^(periode|period|formule|room|chambre|type_de_chambre|prix|price|tarif|rate|devise|currency|unite|unit|debut|start|fin|end)$/.test(
        header,
      ),
    );
    return headers.length >= 3 && known.length >= 2;
  }

  private isMarkdownSeparator(line: string): boolean {
    return /^\s*\|?\s*:?-{3,}/.test(line) && line.includes('|');
  }

  private tableRowMetadata(fields: Record<string, string>): Record<string, unknown> {
    const byAliases = (...aliases: string[]) => {
      const match = Object.entries(fields).find(([key]) =>
        aliases.includes(this.normalizeKey(key)),
      );
      return match?.[1]?.trim() || null;
    };
    const period = byAliases('periode', 'period', 'formule');
    const roomType = byAliases('room', 'chambre', 'type_de_chambre');
    const priceText = byAliases('prix', 'price', 'tarif', 'rate');
    const numericPrice = priceText?.match(/\d+(?:[.,]\d+)?/)?.[0] ?? null;
    const currency =
      byAliases('devise', 'currency') ??
      priceText?.match(/\b(TND|DT|EUR|USD)\b/i)?.[1]?.toUpperCase() ??
      null;
    const unit = byAliases('unite', 'unit');
    const startDate = byAliases('debut', 'start');
    const endDate = byAliases('fin', 'end');
    const isHotelPrice = Boolean(roomType && priceText);

    return {
      category: isHotelPrice ? 'hotel_prices' : 'structured_table',
      period,
      roomType,
      price: numericPrice ? Number(numericPrice.replace(',', '.')) : null,
      currency: currency === 'DT' ? 'TND' : currency,
      unit,
      startDate,
      endDate,
    };
  }

  private tableRowContent(
    fields: Record<string, string>,
    metadata: Record<string, unknown>,
  ): string {
    const facts = Object.entries(fields)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${key}: ${value}`);
    if (!facts.length) return '';

    const roomType = typeof metadata.roomType === 'string' ? metadata.roomType : '';
    const period = typeof metadata.period === 'string' ? metadata.period : '';
    const title = roomType
      ? `Tarif hotel${period ? ` ${period}` : ''} - ${roomType}`
      : `Ligne de tableau${period ? ` ${period}` : ''}`;
    return `${title}. ${facts.join('. ')}.`;
  }

  private normalizeKey(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private normalizeDocument(value: string): string {
    return (value ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\t\f\v ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private splitIntoSections(value: string): string[] {
    const blocks = value
      .split(/\n{2,}/)
      .map((block) => block.replace(/\n+/g, ' ').trim())
      .filter(Boolean);

    const merged: string[] = [];
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (
        /^#{1,6}\s+[^.!?;:]{1,80}$/.test(block) &&
        blocks[index + 1]
      ) {
        merged.push(`${block} ${blocks[index + 1]}`);
        index += 1;
      } else {
        merged.push(block);
      }
    }

    return merged.length > 0 ? merged : [value.replace(/\s+/g, ' ').trim()];
  }

  private sliceSection(
    section: string,
    chunkSize: number,
    chunkOverlap: number,
  ): Array<{ content: string; start: number; end: number }> {
    if (section.length <= chunkSize) {
      return [{ content: section, start: 0, end: section.length }];
    }

    const slices: Array<{ content: string; start: number; end: number }> = [];
    let start = 0;

    while (start < section.length) {
      const hardEnd = Math.min(start + chunkSize, section.length);
      const end =
        hardEnd < section.length
          ? this.findNaturalBoundary(section, start, hardEnd)
          : hardEnd;
      const content = section.slice(start, end).trim();

      if (content) {
        slices.push({ content, start, end });
      }

      if (end >= section.length) {
        break;
      }

      start = Math.max(start + 1, end - chunkOverlap);
    }

    return slices;
  }

  private findNaturalBoundary(value: string, start: number, hardEnd: number): number {
    const minimum = start + Math.floor((hardEnd - start) * 0.55);
    const candidates = ['. ', '; ', ', ', ' '];

    for (const separator of candidates) {
      const index = value.lastIndexOf(separator, hardEnd);

      if (index >= minimum) {
        return index + separator.length;
      }
    }

    return hardEnd;
  }
}
