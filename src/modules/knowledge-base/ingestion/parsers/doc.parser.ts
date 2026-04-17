import { BadRequestException, Injectable } from '@nestjs/common';
import mammoth from 'mammoth';

@Injectable()
export class DocParser {
  async parse(buffer: Buffer, filename?: string): Promise<string> {
    if (!buffer || !buffer.length) {
      throw new BadRequestException('DOC buffer is empty');
    }

    const extension = (filename ?? '').toLowerCase();

    if (extension.endsWith('.docx')) {
      try {
        const extracted = await mammoth.extractRawText({ buffer });
        const content = extracted.value.replace(/\s+/g, ' ').trim();

        if (!content) {
          throw new BadRequestException(
            `Unable to parse DOC file: ${filename ?? 'unknown file'}`,
          );
        }

        return content;
      } catch {
        throw new BadRequestException(
          `Unable to parse DOCX file: ${filename ?? 'unknown file'}`,
        );
      }
    }

    if (extension.endsWith('.doc')) {
      throw new BadRequestException(
        'Legacy .doc files are not supported yet. Please convert to .docx.',
      );
    }

    const content = buffer.toString('utf-8').replace(/\s+/g, ' ').trim();

    if (!content) {
      throw new BadRequestException(`Unable to parse DOC file: ${filename ?? 'unknown file'}`);
    }

    return content;
  }
}
