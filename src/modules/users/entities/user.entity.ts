export class UserEntity {
  id!: string;
  firstName!: string;
  lastName?: string | null;
  fullName!: string;
  email!: string;
  phoneNumber?: string | null;
  role!: string;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
