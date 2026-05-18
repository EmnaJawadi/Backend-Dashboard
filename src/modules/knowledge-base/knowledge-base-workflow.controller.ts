import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { KbArticlesService } from './kb-articles.service';
import { LearnFromHumanResponseDto } from './dto/learn-from-human-response.dto';
import { PublishKbArticleDto } from './dto/publish-kb-article.dto';
import { ReviewKbSuggestionDto } from './dto/review-kb-suggestion.dto';

@Controller(['knowledge-base', 'api/knowledge-base'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class KnowledgeBaseWorkflowController {
  constructor(private readonly kbArticlesService: KbArticlesService) {}

  @Post('learn-from-human-response')
  learnFromHumanResponse(
    @Body() dto: LearnFromHumanResponseDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (actor.role !== UserRole.SUPER_ADMIN) {
      dto.companyId = actor.companyId ?? dto.companyId;
    }
    dto.createdBy = actor.sub;
    return this.kbArticlesService.learnFromHumanResponse(dto);
  }

  @Get('suggestions')
  findSuggestions(
    @Query('companyId') companyId?: string,
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.kbArticlesService.findSuggestions({ companyId, status, actor });
  }

  @Patch('suggestions/:id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  approveSuggestion(
    @Param('id') id: string,
    @Body() dto: ReviewKbSuggestionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    dto.reviewedBy = actor.sub;
    return this.kbArticlesService.approveSuggestion(id, dto, actor);
  }

  @Patch('suggestions/:id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  rejectSuggestion(
    @Param('id') id: string,
    @Body() dto: ReviewKbSuggestionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    dto.reviewedBy = actor.sub;
    return this.kbArticlesService.rejectSuggestion(id, dto, actor);
  }

  @Get('drafts')
  findDrafts(
    @Query('companyId') companyId?: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.kbArticlesService.findDrafts(companyId, actor);
  }

  @Patch(':id/publish')
  publish(
    @Param('id') id: string,
    @Body() dto: PublishKbArticleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kbArticlesService.publish(id, dto, actor);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.kbArticlesService.reject(id, actor);
  }
}
