export class CreateContactNoteDto {
  contactId!: string;
  content!: string;
  authorId?: string | null;
  authorName?: string | null;
  isPinned?: boolean;
}