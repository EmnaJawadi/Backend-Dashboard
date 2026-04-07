import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { KbArticlesService } from './kb-articles.service';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { PublishKbArticleDto } from './dto/publish-kb-article.dto';
import { KbArticleQueryDto } from './dto/kb-article-query.dto';
import { IngestKbSourceDto } from './dto/ingest-kb-source.dto';
import { KbChunksService } from './kb-chunks.service';

@Controller('knowledge-base/articles')
export class KbArticlesController {
  constructor(
    private readonly kbArticlesService: KbArticlesService,
    private readonly kbChunksService: KbChunksService,
  ) {}

  @Post()
  create(@Body() createKbArticleDto: CreateKbArticleDto) {
    return this.kbArticlesService.create(createKbArticleDto);
  }

  @Post('ingest')
  ingest(@Body() ingestKbSourceDto: IngestKbSourceDto) {
    return this.kbArticlesService.ingest(ingestKbSourceDto);
  }

  @Get()
  findAll(@Query() query: KbArticleQueryDto) {
    return this.kbArticlesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.kbArticlesService.findOne(id);
  }

  @Get(':id/chunks')
  findChunks(@Param('id') id: string) {
    return this.kbChunksService.findByArticleId(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateKbArticleDto: UpdateKbArticleDto,
  ) {
    return this.kbArticlesService.update(id, updateKbArticleDto);
  }

  @Patch(':id/publish')
  publish(
    @Param('id') id: string,
    @Body() publishKbArticleDto: PublishKbArticleDto,
  ) {
    return this.kbArticlesService.publish(id, publishKbArticleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.kbArticlesService.remove(id);
  }
}