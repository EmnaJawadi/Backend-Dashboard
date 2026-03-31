import { ConversationStatus } from '../entities/conversation.entity';

export class CreateConversationDto {
  contactId!: string;
  contactName?: string;
  phoneNumber?: string;
  status?: ConversationStatus;
  assignedTo?: string | null;
  botActive?: boolean;
  lastMessage?: string | null;
}