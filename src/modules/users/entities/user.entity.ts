export type UserRole = 'admin' | 'agent' | 'supervisor';

export class UserEntity {
  id!: string;
  firstName!: string;
  lastName?: string | null;
  fullName!: string;
  email!: string;
  phoneNumber?: string | null;
  role!: UserRole;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}