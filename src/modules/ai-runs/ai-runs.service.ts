import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { AiRunsRepository } from './ai-runs.repository';
import { CreateAiRunDto } from './dto/create-ai-run.dto';
import { AiRunQueryDto } from './dto/ai-run-query.dto';
import { AiRunEntity } from './entities/ai-run.entity';

@Injectable()
export class AiRunsService {
  constructor(private readonly aiRunsRepository: AiRunsRepository) {}

  private resolveRequiredCompanyId(
    actor: AuthenticatedUser | undefined,
    requestedCompanyId?: string | null,
  ): string {
    const actorCompanyId = resolveCompanyScope(actor);
    const requested = requestedCompanyId?.trim() || null;

    if (actorCompanyId) {
      if (requested && requested !== actorCompanyId) {
        throw new BadRequestException(
          'companyId is resolved from the authenticated user',
        );
      }

      return actorCompanyId;
    }

    if (!requested) {
      throw new BadRequestException(
        'companyId is required for strict multi-company AI run operations',
      );
    }

    return requested;
  }

  async create(
    createAiRunDto: CreateAiRunDto,
    actor?: AuthenticatedUser,
  ): Promise<AiRunEntity> {
    const companyId = resolveCompanyScope(actor);
    const aiRun = await this.aiRunsRepository.create({
      ...createAiRunDto,
      companyId: companyId ?? createAiRunDto.companyId,
    });
    return new AiRunEntity(aiRun);
  }

  async findAll(query: AiRunQueryDto, actor?: AuthenticatedUser) {
    const companyId = this.resolveRequiredCompanyId(actor, query.companyId);
    const result = await this.aiRunsRepository.findMany(
      query,
      companyId,
    );

    return {
      data: result.data.map((item) => new AiRunEntity(item)),
      meta: result.meta,
    };
  }

  async findOne(id: string, actor?: AuthenticatedUser): Promise<AiRunEntity> {
    const aiRun = await this.aiRunsRepository.findById(
      id,
      resolveCompanyScope(actor),
    );

    if (!aiRun) {
      throw new NotFoundException(`AI run with ID "${id}" not found`);
    }

    return new AiRunEntity(aiRun);
  }

  async remove(id: string, actor?: AuthenticatedUser): Promise<{ message: string }> {
    await this.findOne(id, actor);
    await this.aiRunsRepository.remove(id, resolveCompanyScope(actor));

    return { message: 'AI run deleted successfully' };
  }
}
