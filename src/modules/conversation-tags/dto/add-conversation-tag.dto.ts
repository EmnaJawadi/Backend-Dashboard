export class AddConversationTagDto {
  conversationId!: string;
  label!: string;
  color?: string | null;
}