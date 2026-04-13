import { ConversationStatus } from '../entities/conversation.entity';
import { IsIn } from 'class-validator';

export class UpdateConversationStatusDto {
  @IsIn([
    'closed',
    'bot_active',
    'human_assigned',
    'waiting_customer',
    'open',
    'pending',
    'human_handoff',
  ])
  status!: ConversationStatus;
}
