import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  create(createUserDto: CreateUserDto) {
    return this.usersRepository.create({
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName ?? null,
      email: createUserDto.email,
      phoneNumber: createUserDto.phoneNumber ?? null,
      role: createUserDto.role ?? 'agent',
      isActive: createUserDto.isActive ?? true,
    });
  }

  findAll(query: UserQueryDto) {
    return this.usersRepository.findAll(query);
  }

  findOne(id: string) {
    return this.usersRepository.findById(id);
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return this.usersRepository.update(id, {
      firstName: updateUserDto.firstName,
      lastName: updateUserDto.lastName,
      email: updateUserDto.email,
      phoneNumber: updateUserDto.phoneNumber,
      role: updateUserDto.role,
      isActive: updateUserDto.isActive,
    });
  }

  updateRole(id: string, updateUserRoleDto: UpdateUserRoleDto) {
    return this.usersRepository.update(id, {
      role: updateUserRoleDto.role,
    });
  }

  remove(id: string) {
    return this.usersRepository.remove(id);
  }
}