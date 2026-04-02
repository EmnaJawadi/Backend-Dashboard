import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy {
  validate(payload: Record<string, unknown>) {
    return payload;
  }
}