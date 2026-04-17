import { BadRequestException, Injectable } from '@nestjs/common';
import JSZip from 'jszip';

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

@Injectable()
export class PptParser {
  async parse(buffer: Buffer, filename?: string): Promise<string> {
    if (!buffer || !buffer.length) {
      throw new BadRequestException('PPT buffer is empty');
    }

    const extension = (filename ?? '').toLowerCase();
    if (extension.endsWith('.ppt') && !extension.endsWith('.pptx')) {
      throw new BadRequestException(
        'Legacy .ppt files are not supported yet. Please convert to .pptx.',
      );
    }

    const zip = await JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
      .filter((path) =>
        /^ppt[\\/]+slides[\\/]+slide\d+\.xml$/i.test(path),
      )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (slidePaths.length === 0) {
      throw new BadRequestException(
        `Unable to parse PowerPoint file: ${filename ?? 'unknown file'}`,
      );
    }

    const slidesText: string[] = [];

    for (const path of slidePaths) {
      const xml = await zip.files[path].async('string');
      const texts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
        .map((match) => decodeXmlEntities(match[1]).trim())
        .filter(Boolean);

      if (texts.length > 0) {
        slidesText.push(texts.join(' '));
      }
    }

    const content = slidesText.join('\n\n').replace(/\s+/g, ' ').trim();

    if (!content) {
      throw new BadRequestException(
        `Unable to parse PowerPoint file: ${filename ?? 'unknown file'}`,
      );
    }

    return content;
  }
}
