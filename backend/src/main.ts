import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';

type RateLimitBucket = { count: number; resetAt: number };

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 300;
const AUTH_RATE_LIMIT_MAX_REQUESTS = 60;

function clientIp(req: Request) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return (value?.split(',')[0] || req.ip || req.socket.remoteAddress || 'unknown').trim();
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const isAuthRoute = req.path.startsWith('/api/v1/auth/');
  const limit = isAuthRoute ? AUTH_RATE_LIMIT_MAX_REQUESTS : RATE_LIMIT_MAX_REQUESTS;
  const key = `${clientIp(req)}:${isAuthRoute ? 'auth' : 'global'}`;
  const current = rateLimitBuckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  if (bucket.count > limit) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ message: 'Too many requests' });
    return;
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

export function validateProductionSecurityConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const jwt = env.JWT_SECRET ?? '';
  if (!jwt.trim() || jwt === 'dev-secret-key-1234!') throw new Error('Production requires JWT_SECRET');
  const origins = [env.FRONTEND_URL ?? '', ...(env.FRONTEND_URLS ?? '').split(',')].map(v => v.trim()).filter(Boolean);
  const validOrigin = (origin: string) => origin.startsWith('https://') || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  if (!origins.length || origins.some(origin => !validOrigin(origin))) throw new Error('Production requires HTTPS or loopback frontend origins');
}

async function bootstrap() {
  validateProductionSecurityConfig();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(cookieParser());
  app.use(rateLimit);
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:3000', ...(process.env.FRONTEND_URLS || '').split(',')]
    .map((origin) => origin.trim())
    .filter((origin, index, origins) => origin && origins.indexOf(origin) === index);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('터잡이 서비스 API 명세서')
    .setDescription('Next.js 프론트엔드 연동용 백엔드 REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // 운영에서는 nginx(127.0.0.1)만 접근하도록 루프백에 바인딩한다. 외부 직접 노출(nginx 우회)을 막는다.
  const bindHost = process.env.BIND_HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
  await app.listen(process.env.PORT ?? 3000, bindHost);
}
bootstrap();
