import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KbRepository } from './kb.repository';
import { KbMapper } from './mappers/kb.mapper';

@Injectable()
export class KbChunksService {
  constructor(
    private readonly kbRepository: KbRepository,
    private readonly kbMapper: KbMapper,
  ) {}

  async findByArticleId(articleId: string, companyId?: string) {
    const article = await this.kbRepository.findById(articleId, companyId);

    if (!article) {
      throw new NotFoundException('Knowledge base article not found');
    }

    const articleCompanyId = article.companyId?.trim();

    if (!articleCompanyId) {
      throw new BadRequestException('Knowledge base article is not linked to a company');
    }

    const chunks = await this.kbRepository.findChunksByArticleId(
      articleId,
      companyId ?? articleCompanyId,
    );
    return chunks.map((chunk: any) => this.kbMapper.toChunkEntity(chunk));
  }
}
