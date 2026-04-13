export type ConversationStatus =
  | 'bot_active'
  | 'human_assigned'
  | 'waiting_customer'
  | 'closed'
  | 'open'
  | 'pending'
  | 'human_handoff';

export interface ConversationParticipant {
  contactId: string;
  contactName?: string;
  phoneNumber?: string;
}

export interface ConversationTag {
  id: string;
  name: string;
  color?: string;
}

export class ConversationEntity {
  id!: string;
  participant!: ConversationParticipant;
  status!: ConversationStatus;
  assignedTo?: string | null;
  botActive!: boolean;
  tags!: ConversationTag[];
  lastMessage?: string | null;
  unreadCount!: number;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<ConversationEntity>) {
    Object.assign(this, partial);
  }
}
