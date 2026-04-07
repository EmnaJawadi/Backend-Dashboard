import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class PdfParser {
  async parse(buffer: Buffer, filename?: string): Promise<string> {
    if (!buffer || !buffer.length) {
      throw new BadRequestException('PDF buffer is empty');
    }

    const content = buffer.toString('utf-8').replace(/\s+/g, ' ').trim();

    if (!content) {
      throw new BadRequestException(`Unable to parse PDF file: ${filename ?? 'unknown file'}`);
    }

    return content;
  }
}