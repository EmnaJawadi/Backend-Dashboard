import { Injectable, NotFoundException } from '@nestjs/common';
import { KbRepository } from './kb.repository';
import { KbMapper } from './mappers/kb.mapper';

@Injectable()
export class KbChunksService {
  constructor(
    private readonly kbRepository: KbRepository,
    private readonly kbMapper: KbMapper,
  ) {}

  async findByArticleId(articleId: string) {
    const article = await this.kbRepository.findById(articleId);

    if (!article) {
      throw new NotFoundException('Knowledge base article not found');
    }

    const chunks = await this.kbRepository.findChunksByArticleId(articleId);
    return chunks.map((chunk: any) => this.kbMapper.toChunkEntity(chunk));
  }
}