import { ConversationStatus } from '../entities/conversation.entity';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsIn([
    'closed',
    'bot_active',
    'human_assigned',
    'waiting_customer',
    'open',
    'pending',
    'human_handoff',
  ])
  status?: ConversationStatus;

  @IsOptional()
  @IsString()
  assignedTo?: string | null;

  @IsOptional()
  @IsBoolean()
  botActive?: boolean;

  @IsOptional()
  @IsString()
  lastMessage?: string | null;
}
