import { Body, Controller, Patch } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { WorkflowHandoffDto } from './dto/workflow-handoff.dto';

@Controller(['', 'api'])
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
