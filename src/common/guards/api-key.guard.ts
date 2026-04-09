import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & {
      headers: Record<string, string | string[] | undefined>;
    }>();

    const providedApiKey = request.headers['x-api-key'];
    const expectedApiKey = this.configService.get<string>('API_KEY');

    if (!expectedApiKey) {
      throw new UnauthorizedException('API key configuration is missing');
    }

    const normalizedProvidedApiKey = Array.isArray(providedApiKey)
      ? providedApiKey[0]
      : providedApiKey;

    if (!normalizedProvidedApiKey || normalizedProvidedApiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}