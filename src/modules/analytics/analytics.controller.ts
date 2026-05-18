import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AnalyticsService } from './analytics.service';
import { ConversationsAnalyticsQuery } from './queries/conversations-analytics.query';
import { AiRunsAnalyticsQuery } from './queries/ai-runs-analytics.query';

@Controller(['analytics', 'api/analytics'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  getOverview(
    @Query() query: ConversationsAnalyticsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.analyticsService.getOverview(query, actor);
  }

  @Get('conversations')
  getConversationMetrics(
    @Query() query: ConversationsAnalyticsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.analyticsService.getConversationMetrics(query, actor);
  }

  @Get('ai-runs')
  getAiRunsMetrics(
    @Query() query: AiRunsAnalyticsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.analyticsService.getAiRunsMetrics(query, actor);
  }
}
