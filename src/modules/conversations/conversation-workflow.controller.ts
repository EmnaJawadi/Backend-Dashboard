import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ConversationsService } from './conversations.service';
import { WorkflowHandoffDto } from './dto/workflow-handoff.dto';

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
}
