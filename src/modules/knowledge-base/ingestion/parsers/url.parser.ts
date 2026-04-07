import { Injectable, BadRequestException } from '@nestjs/common';

export interface ParsedKbSource {
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class UrlParser {
  async parse(url: string): Promise<ParsedKbSource> {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new BadRequestException(`Unable to fetch URL: ${url}`);
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || 'Untitled page';

    const content = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      title,
      content,
      metadata: {
        sourceType: 'url',
        sourceUrl: url,
      },
    };
  }
}