import { Injectable, NotFoundException } from '@nestjs/common';
import { AiRunsRepository } from './ai-runs.repository';
import { CreateAiRunDto } from './dto/create-ai-run.dto';
import { AiRunQueryDto } from './dto/ai-run-query.dto';
import { AiRunEntity } from './entities/ai-run.entity';

@Injectable()
export class AiRunsService {
  constructor(private readonly aiRunsRepository: AiRunsRepository) {}

  async create(createAiRunDto: CreateAiRunDto): Promise<AiRunEntity> {
    const aiRun = await this.aiRunsRepository.create(createAiRunDto);
    return new AiRunEntity(aiRun);
  }

  async findAll(query: AiRunQueryDto) {
    const result = await this.aiRunsRepository.findMany(query);

    return {
      data: result.data.map((item: Partial<AiRunEntity>) => new AiRunEntity(item)),
      meta: result.meta,
    };
  }

  async findOne(id: string): Promise<AiRunEntity> {
    const aiRun = await this.aiRunsRepository.findById(id);

    if (!aiRun) {
      throw new NotFoundException(`AI run with ID "${id}" not found`);
    }

    return new AiRunEntity(aiRun);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.aiRunsRepository.remove(id);

    return {
      message: 'AI run deleted successfully',
    };
  }
}