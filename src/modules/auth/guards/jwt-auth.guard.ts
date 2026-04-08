import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser>(err: unknown, user: TUser, _info: unknown, _ctx?: unknown) {
    if (err || !user) {
      throw err;
    }
    return user;
  }

  // optional helper typing (not required)
  getRequest(context: any): Request {
    return context.switchToHttp().getRequest();
  }
}