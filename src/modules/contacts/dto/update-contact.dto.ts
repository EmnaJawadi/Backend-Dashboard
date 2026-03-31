export class UpdateContactDto {
  firstName?: string;
  lastName?: string | null;
  phoneNumber?: string;
  email?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
  tags?: string[];
  isBlocked?: boolean;
}