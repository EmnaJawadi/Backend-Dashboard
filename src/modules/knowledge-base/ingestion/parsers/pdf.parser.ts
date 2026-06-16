import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

// pdf-parse injects "-- N of M --" page separators — strip them before checking emptiness
const PAGE_SEPARATOR_RE = /^--\s*\d+\s*of\s*\d+\s*--$/;

@Injectable()
export class PdfParser {
  private readonly logger = new Logger(PdfParser.name);

  async parse(buffer: Buffer, filename?: string): Promise<string> {
    if (!buffer || !buffer.length) {
      throw new BadRequestException('Le fichier PDF reçu est vide.');
    }

    try {
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();

      const content = parsed.text
        .split('\n')
        .filter((line) => !PAGE_SEPARATOR_RE.test(line.trim()))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();

      if (!content) {
        throw new BadRequestException(
          'PDF sans contenu texte détecté. Assurez-vous que le PDF contient du texte sélectionnable et non uniquement des images.',
        );
      }

      return content;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        `PDF_PARSE_FAILED file=${filename ?? 'unknown'} size=${buffer.length}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new BadRequestException(
        "Le fichier PDF n'a pas pu être analysé. Vérifiez que le fichier n'est pas corrompu et réessayez.",
      );
    }
  }
}
