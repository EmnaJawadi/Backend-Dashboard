import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class DocParser {
  async parse(buffer: Buffer, filename?: string): Promise<string> {
    if (!buffer || !buffer.length) {
      throw new BadRequestException('DOC buffer is empty');
    }

    const content = buffer.toString('utf-8').trim();

    if (!content) {
      throw new BadRequestException(`Unable to parse DOC file: ${filename ?? 'unknown file'}`);
    }

    return content;
  }
}