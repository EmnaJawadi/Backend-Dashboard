import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { KbArticlesService } from './kb-articles.service';
import { LearnFromHumanResponseDto } from './dto/learn-from-human-response.dto';
import { PublishKbArticleDto } from './dto/publish-kb-article.dto';

@Controller(['knowledge-base', 'api/knowledge-base'])
export class KnowledgeBaseWorkflowController {
  constructor(private readonly kbArticlesService: KbArticlesService) {}

  @Post('learn-from-human-response')
  learnFromHumanResponse(@Body() dto: LearnFromHumanResponseDto) {
    return this.kbArticlesService.learnFromHumanResponse(dto);
  }

  @Get('drafts')
  findDrafts(@Query('companyId') companyId?: string) {
    return this.kbArticlesService.findDrafts(companyId);
  }

  @Patch(':id/publish')
  publish(@Param('id') id: string, @Body() dto: PublishKbArticleDto) {
    return this.kbArticlesService.publish(id, dto);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.kbArticlesService.reject(id);
  }
}
