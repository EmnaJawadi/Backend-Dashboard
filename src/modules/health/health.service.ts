import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  private readonly startedAt = new Date();

  check() {
    return {
      status: 'ok',
      service: 'backend-support-whatsapp',
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: this.startedAt.toISOString(),
      timestamp: new Date().toISOString(),
    };
  }
}
