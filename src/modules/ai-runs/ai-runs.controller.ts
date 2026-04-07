import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AiRunsService } from './ai-runs.service';
import { CreateAiRunDto } from './dto/create-ai-run.dto';
import { AiRunQueryDto } from './dto/ai-run-query.dto';

@Controller('ai-runs')
export class AiRunsController {
  constructor(private readonly aiRunsService: AiRunsService) {}

  @Post()
  create(@Body() createAiRunDto: CreateAiRunDto) {
    return this.aiRunsService.create(createAiRunDto);
  }

  @Get()
  findAll(@Query() query: AiRunQueryDto) {
    return this.aiRunsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aiRunsService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.aiRunsService.remove(id);
  }
}