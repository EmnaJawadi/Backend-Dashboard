export class UpdateContactNoteDto {
  content?: string;
  authorId?: string | null;
  authorName?: string | null;
  isPinned?: boolean;
}