import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserEntity } from './entities/user.entity';
import { UserMapper } from './mappers/user.mapper';

@Injectable()
export class UsersRepository {
  private readonly users: UserEntity[] = [];

  create(data: Partial<UserEntity>): UserEntity {
    const now = new Date();
    const firstName = data.firstName?.trim() ?? '';
    const lastName = data.lastName?.trim() ?? null;

    const user = UserMapper.toEntity({
      id: randomUUID(),
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(' '),
      email: data.email?.trim() ?? '',
      phoneNumber: data.phoneNumber ?? null,
      role: data.role ?? 'agent',
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    this.users.push(user);
    return user;
  }

  findAll(query: UserQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    let data = [...this.users];

    if (query.search) {
      const search = query.search.toLowerCase();
      data = data.filter(
        (user) =>
          user.firstName.toLowerCase().includes(search) ||
          user.lastName?.toLowerCase().includes(search) ||
          user.fullName.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search) ||
          user.phoneNumber?.toLowerCase().includes(search),
      );
    }

    if (query.role) {
      data = data.filter((user) => user.role === query.role);
    }

    if (query.isActive !== undefined) {
      const isActive = query.isActive === 'true';
      data = data.filter((user) => user.isActive === isActive);
    }

    const total = data.length;
    const start = (page - 1) * limit;
    const paginated = data.slice(start, start + limit);

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  findById(id: string): UserEntity {
    const user = this.users.find((item) => item.id === id);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return user;
  }

  update(id: string, data: Partial<UserEntity>): UserEntity {
    const user = this.findById(id);

    if (data.firstName !== undefined) {
      user.firstName = data.firstName.trim();
    }

    if (data.lastName !== undefined) {
      user.lastName = data.lastName?.trim() ?? null;
    }

    if (data.email !== undefined) {
      user.email = data.email.trim();
    }

    if (data.phoneNumber !== undefined) {
      user.phoneNumber = data.phoneNumber;
    }

    if (data.role !== undefined) {
      user.role = data.role;
    }

    if (data.isActive !== undefined) {
      user.isActive = data.isActive;
    }

    user.fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    user.updatedAt = new Date();

    return user;
  }

  remove(id: string): UserEntity {
    const index = this.users.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const deleted = this.users[index];
    this.users.splice(index, 1);

    return deleted;
  }
}