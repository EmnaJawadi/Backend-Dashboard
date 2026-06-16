import { BadRequestException, Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { basename, extname } from 'node:path';

export type UploadedKnowledgeFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Injectable()
export class FileSecurityService {
  async validate(file: UploadedKnowledgeFile, allowedExtensions?: string[]) {
    if (!file.buffer?.length || file.size <= 0) {
      throw new BadRequestException('Le fichier importe est vide.');
    }

    const safeName = basename(file.originalname);
    if (!safeName || safeName !== file.originalname || /[\u0000-\u001f]/.test(safeName)) {
      throw new BadRequestException('Nom de fichier invalide.');
    }

    const extension = extname(safeName).toLowerCase();
    const allowed = allowedExtensions ?? ['.pdf', '.docx', '.pptx', '.json', '.yaml', '.yml'];
    if (!allowed.includes(extension)) {
      throw new BadRequestException(
        `Type de fichier non autorise. Extensions acceptees: ${allowed.join(', ')}`,
      );
    }

    if (extension === '.pdf') {
      if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new BadRequestException('Le contenu du fichier ne correspond pas a un PDF valide.');
      }
      return;
    }

    if (extension === '.docx' || extension === '.pptx') {
      if (file.buffer.subarray(0, 2).toString('ascii') !== 'PK') {
        throw new BadRequestException('Le document Office importe est invalide.');
      }

      try {
        const archive = await JSZip.loadAsync(file.buffer);
        const requiredEntry =
          extension === '.docx' ? 'word/document.xml' : 'ppt/presentation.xml';
        if (!archive.file(requiredEntry)) {
          throw new BadRequestException('Le document Office ne correspond pas a son extension.');
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('Le document Office est corrompu ou illisible.');
      }
      return;
    }

    const textSample = file.buffer.subarray(0, Math.min(file.buffer.length, 8192));
    if (textSample.includes(0)) {
      throw new BadRequestException('Le fichier structure contient des donnees binaires inattendues.');
    }

    if (extension === '.json') {
      try {
        JSON.parse(file.buffer.toString('utf8'));
      } catch {
        throw new BadRequestException('Le fichier JSON est invalide.');
      }
    }
  }
}
