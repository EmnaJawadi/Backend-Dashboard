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

    const providedApiKey =
      request.headers['x-api-key'] ??
      request.headers['apikey'] ??
      request.headers['api-key'] ??
      request.headers['x-api_key'];
    const expectedApiKeys = [
      this.configService.get<string>('API_KEY'),
      process.env.API_KEY,
      this.configService.get<string>('EVOLUTION_API_KEY'),
      process.env.EVOLUTION_API_KEY,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    if (expectedApiKeys.length === 0) {
      throw new UnauthorizedException('API key configuration is missing');
    }

    const normalizedProvidedApiKey = Array.isArray(providedApiKey)
      ? providedApiKey[0]
      : providedApiKey;

    if (
      !normalizedProvidedApiKey ||
      !expectedApiKeys.includes(normalizedProvidedApiKey)
    ) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
