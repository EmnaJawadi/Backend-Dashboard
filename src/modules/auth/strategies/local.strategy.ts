import { Injectable } from '@nestjs/common';

@Injectable()
export class LocalStrategy {
  validate(email: string, password: string) {
    return { email, password };
  }
}