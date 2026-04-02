import { UserEntity } from '../entities/user.entity';

export class UserMapper {
  static toEntity(data: Partial<UserEntity>): UserEntity {
    return new UserEntity(data);
  }
}