export class ContactNoteEntity {
  id!: string;
  companyId?: string | null;
  contactId!: string;
  content!: string;
  authorId?: string | null;
  authorName?: string | null;
  isPinned!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<ContactNoteEntity>) {
    Object.assign(this, partial);
  }
}
