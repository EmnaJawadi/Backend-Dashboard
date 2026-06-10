import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ConversationsService } from './conversations.service';
import { WorkflowHandoffDto } from './dto/workflow-handoff.dto';
import { WorkflowOrderIntentDto } from './dto/workflow-order-intent.dto';

@Controller(['', 'api'])
@UseGuards(ApiKeyGuard)
export class ConversationWorkflowController {
  constructor(
    private readonly conversationsService: ConversationsService,
  ) {}

  @Patch('handoff')
  handoff(@Body() workflowHandoffDto: WorkflowHandoffDto) {
    return this.conversationsService.handoffForWorkflow(
      workflowHandoffDto,
    );
  }

  @Post('conversations/workflow/order-intent')
  prepareOrderIntent(@Body() dto: WorkflowOrderIntentDto) {
    return this.conversationsService.prepareOrderIntentForWorkflow(dto);
  }
}
