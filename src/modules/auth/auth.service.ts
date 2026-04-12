import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { AuthMapper } from './mappers/auth.mapper';

type AuthUser = {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  password: string;
  phoneNumber?: string | null;
role: 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';
   isActive: boolean;
};

@Injectable()
export class AuthService {
  private readonly users: AuthUser[] = [
    {
      id: randomUUID(),
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'admin123',
      phoneNumber: null,
      role: 'ADMIN',
      isActive: true,
    },
  ];

  register(registerUserDto: RegisterUserDto) {
    const existing = this.users.find(
      (user) => user.email.toLowerCase() === registerUserDto.email.toLowerCase(),
    );

    if (existing) {
      throw new UnauthorizedException('User already exists');
    }

    const user: AuthUser = {
      id: randomUUID(),
      firstName: registerUserDto.firstName,
      lastName: registerUserDto.lastName ?? null,
      email: registerUserDto.email,
      password: registerUserDto.password,
      phoneNumber: registerUserDto.phoneNumber ?? null,
      role: 'AGENT',
      isActive: true,
    };

    this.users.push(user);

    return AuthMapper.toAuthResponse({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      accessToken: `access-${user.id}`,
      refreshToken: `refresh-${user.id}`,
    });
  }

  login(loginDto: LoginDto) {
    const user = this.users.find(
      (item) =>
        item.email.toLowerCase() === loginDto.email.toLowerCase() &&
        item.password === loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return AuthMapper.toAuthResponse({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      accessToken: `access-${user.id}`,
      refreshToken: `refresh-${user.id}`,
    });
  }

  refresh(refreshTokenDto: RefreshTokenDto) {
    if (!refreshTokenDto.refreshToken?.startsWith('refresh-')) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userId = refreshTokenDto.refreshToken.replace('refresh-', '');
    const user = this.users.find((item) => item.id === userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return AuthMapper.toAuthResponse({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      accessToken: `access-${user.id}`,
      refreshToken: `refresh-${user.id}`,
    });
  }

  getProfileFromToken(token?: string) {
    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const normalized = token.replace('Bearer ', '');
    const userId = normalized.replace('access-', '');
    const user = this.users.find((item) => item.id === userId);

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' '),
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isActive: user.isActive,
    };
  }
}