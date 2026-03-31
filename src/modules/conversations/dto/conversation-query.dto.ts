import { ConversationStatus } from '../entities/conversation.entity';

export class ConversationQueryDto {
  search?: string;
  status?: ConversationStatus;
  assignedTo?: string;
  botActive?: string;
  page?: number;
  limit?: number;
}