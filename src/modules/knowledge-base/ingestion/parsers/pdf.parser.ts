import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class PdfParser {
  async parse(buffer: Buffer, filename?: string): Promise<string> {
    if (!buffer || !buffer.length) {
      throw new BadRequestException('PDF buffer is empty');
    }

    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    const content = parsed.text.replace(/\s+/g, ' ').trim();

    if (!content) {
      throw new BadRequestException(`Unable to parse PDF file: ${filename ?? 'unknown file'}`);
    }

    return content;
  }
}
