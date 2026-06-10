import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { WebhooksService } from './webhooks.service';
import { EvolutionWebhookDto } from './dto/evolution-webhook.dto';
import { N8nNormalizedMessageDto } from './dto/n8n-normalized-message.dto';
import { WebhookQueryDto } from './dto/webhook-query.dto';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('evolution')
  @UseGuards(ApiKeyGuard)
  receiveEvolutionWebhook(@Body() payload: EvolutionWebhookDto) {
    return this.webhooksService.receiveEvolutionWebhook(payload);
  }

  @Post('n8n/normalized-message')
  @UseGuards(ApiKeyGuard)
  receiveN8nNormalizedMessage(@Body() payload: N8nNormalizedMessageDto) {
    return this.webhooksService.processN8nNormalizedMessage(payload);
  }

  @Post('n8n/persist')
  @UseGuards(ApiKeyGuard)
  persistN8nNormalizedWebhook(@Body() payload: N8nNormalizedMessageDto) {
    return this.webhooksService.persistN8nNormalizedWebhook(payload);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  findAll(
    @Query() query: WebhookQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.webhooksService.findAll(query, actor);
  }
}
