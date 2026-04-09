export class CreateUserDto {
  firstName!: string;
  lastName?: string | null;
  email!: string;
  phoneNumber?: string | null;
  role?: string;
  companyId?: string | null;
  isActive?: boolean;
}