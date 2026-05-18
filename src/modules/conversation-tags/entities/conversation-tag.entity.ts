export class ConversationTagEntity {
  id!: string;
  companyId?: string | null;
  conversationId!: string;
  label!: string;
  color?: string | null;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<ConversationTagEntity>) {
    Object.assign(this, partial);
  }
}
