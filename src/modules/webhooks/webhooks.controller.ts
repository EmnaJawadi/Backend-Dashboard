import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { EvolutionWebhookDto } from './dto/evolution-webhook.dto';
import { WebhookQueryDto } from './dto/webhook-query.dto';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('evolution')
  receiveEvolutionWebhook(@Body() payload: EvolutionWebhookDto) {
    return this.webhooksService.receiveEvolutionWebhook(payload);
  }

  @Get()
  findAll(@Query() query: WebhookQueryDto) {
    return this.webhooksService.findAll(query);
  }
}