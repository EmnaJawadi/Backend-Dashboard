import { UserEntity } from '../entities/user.entity';

type RawUser = {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  phoneNumber?: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class UserMapper {
  static toEntity(user: RawUser): UserEntity {
    return new UserEntity({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName ?? null,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' '),
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  static toEntities(users: RawUser[]): UserEntity[] {
    return users.map((user) => this.toEntity(user));
  }
}
