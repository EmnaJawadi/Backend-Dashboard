export class RegisterUserDto {
  firstName!: string;
  lastName?: string | null;
  email!: string;
  password!: string;
  phoneNumber?: string | null;
}