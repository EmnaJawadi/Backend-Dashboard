import { ConversationStatus } from '../entities/conversation.entity';

export class UpdateConversationStatusDto {
  status!: ConversationStatus;
}