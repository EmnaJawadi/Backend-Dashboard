import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';
import { UserMapper } from './mappers/user.mapper';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  create(createUserDto: CreateUserDto): UserEntity {
    const user = this.usersRepository.create({
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName ?? null,
      email: createUserDto.email,
      phoneNumber: createUserDto.phoneNumber ?? null,
      role: createUserDto.role ?? 'agent',
      companyId: createUserDto.companyId ?? null,
      isActive: createUserDto.isActive ?? true,
    });

    return UserMapper.toEntity(user);
  }

  findAll(query: QueryUsersDto) {
    const result = this.usersRepository.findMany(query);

    return {
      data: UserMapper.toEntities(result.data),
      meta: result.meta,
    };
  }

  findOne(id: string): UserEntity {
    const user = this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return UserMapper.toEntity(user);
  }

  update(id: string, updateUserDto: UpdateUserDto): UserEntity {
    const user = this.usersRepository.update(id, {
      firstName: updateUserDto.firstName,
      lastName: updateUserDto.lastName,
      email: updateUserDto.email,
      phoneNumber: updateUserDto.phoneNumber,
      role: updateUserDto.role,
      companyId: updateUserDto.companyId,
      isActive: updateUserDto.isActive,
    });

    return UserMapper.toEntity(user);
  }

  updateRole(id: string, updateUserRoleDto: UpdateUserRoleDto): UserEntity {
    const user = this.usersRepository.update(id, {
      role: updateUserRoleDto.role,
    });

    return UserMapper.toEntity(user);
  }

  remove(id: string): UserEntity {
    const user = this.usersRepository.remove(id);
    return UserMapper.toEntity(user);
  }
}