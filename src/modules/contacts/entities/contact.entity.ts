export class ContactEntity {
  id!: string;
  firstName!: string;
  lastName?: string | null;
  fullName!: string;
  phoneNumber!: string;
  email?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
  tags!: string[];
  isBlocked!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<ContactEntity>) {
    Object.assign(this, partial);
  }
}