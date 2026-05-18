import "reflect-metadata";
import "dotenv/config";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { AppModule } from "./app.module";
import { PrismaService } from "./database/prisma/prisma.service";

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = '0.0.0.0';
const PORT_FALLBACK_LIMIT = Number(process.env.PORT_FALLBACK_LIMIT || 20);

function resolvePort(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_PORT);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return parsed;
}

function isAddressInUseError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
  );
}

function canListen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findAvailablePort(startPort: number, host: string): Promise<number> {
  for (let offset = 0; offset < PORT_FALLBACK_LIMIT; offset += 1) {
    const port = startPort + offset;

    if (port > 65535) {
      break;
    }

    if (await canListen(port, host)) {
      return port;
    }

    console.warn(`Port ${port} is already in use. Trying ${port + 1}...`);
  }

  throw new Error(
    `No available port found from ${startPort} to ${startPort + PORT_FALLBACK_LIMIT - 1}`,
  );
}

async function listenWithFallback(
  app: INestApplication,
  startPort: number,
  host: string,
): Promise<number> {
  let port = await findAvailablePort(startPort, host);

  for (let attempts = 0; attempts < PORT_FALLBACK_LIMIT; attempts += 1) {
    try {
      await app.listen(port, host);
      return port;
    } catch (error) {
      if (!isAddressInUseError(error)) {
        throw error;
      }

      console.warn(`Port ${port} became busy during startup. Trying ${port + 1}...`);
      port = await findAvailablePort(port + 1, host);
    }
  }

  throw new Error(`Unable to bind server after ${PORT_FALLBACK_LIMIT} attempts`);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const uploadsRoot = join(process.cwd(), 'uploads');

  mkdirSync(uploadsRoot, { recursive: true });
  app.useStaticAssets(uploadsRoot, { prefix: '/uploads/' });

  const configuredCorsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedCorsOrigins = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...configuredCorsOrigins,
  ]);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isLocalDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(
        origin,
      );
      callback(null, allowedCorsOrigins.has(origin) || isLocalDevOrigin);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Optionnel mais propre si tu veux /api/auth/login au lieu de /auth/login
  // app.setGlobalPrefix("api");

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const port = await listenWithFallback(
    app,
    resolvePort(process.env.PORT),
    process.env.HOST || DEFAULT_HOST,
  );

  console.log(`Server running on http://${process.env.HOST || DEFAULT_HOST}:${port}`);
}

void bootstrap();
