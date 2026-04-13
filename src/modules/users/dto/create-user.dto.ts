export class CreateUserDto {
  firstName!: string;
  lastName?: string | null;
  email!: string;
  phoneNumber?: string | null;
  role?: string;
  isActive?: boolean;
}
