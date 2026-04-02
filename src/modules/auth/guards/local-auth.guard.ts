import { Injectable } from '@nestjs/common';

@Injectable()
export class LocalAuthGuard {
  canActivate(): boolean {
    return true;
  }
}