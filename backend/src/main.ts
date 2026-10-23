import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';

type RateLimitBucket = { count: number; resetAt: number };
type RateLimitPolicy = { key: string; limit: number };

const readPositiveInt = (name: string, fallback: number) => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = readPositiveInt('RATE_LIMIT_WINDOW_MS', 60_000);
const RATE_LIMIT_MAX_REQUESTS = readPositiveInt('RATE_LIMIT_MAX_REQUESTS', 300);
const AUTH_RATE_LIMIT_MAX_REQUESTS = readPositiveInt('AUTH_RATE_LIMIT_MAX_REQUESTS', 60);
const DATA_RATE_LIMIT_MAX_REQUESTS = readPositiveInt('DATA_RATE_LIMIT_MAX_REQUESTS', 60);
const MAX_RATE_LIMIT_BUCKETS = readPositiveInt('RATE_LIMIT_MAX_BUCKETS', 50_000);

// 크롤링 비용이 큰(외부 API·DB·AI 호출) 경로는 일반 경로보다 낮은 한도를 적용한다.
const DATA_HEAVY_PREFIXES = [
  '/api/v1/public-data',
  '/api/v1/properties',
  '/api/v1/architects',
  '/api/v1/discovery',
  '/api/v1/events',
  '/api/v1/notifications',
];

const DEFAULT_BLOCKED_BOT_PATTERN =
  /(?:GPTBot|ChatGPT-User|OAI-SearchBot|CCBot|ClaudeBot|Claude-Web|anthropic-ai|Google-Extended|Bytespider|PerplexityBot|Amazonbot|Applebot-Extended|meta-externalagent|FacebookBot|cohere-ai|Diffbot|Omgilibot|ImagesiftBot|FriendlyCrawler|Scrapy|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|DataForSeoBot|Barkrowler)/i;

const blockAiCrawlers = process.env.BLOCK_AI_CRAWLERS !== 'off';
let blockedBotPattern = DEFAULT_BLOCKED_BOT_PATTERN;
if (process.env.BLOCKED_BOT_USER_AGENTS) {
  try {
    blockedBotPattern = new RegExp(process.env.BLOCKED_BOT_USER_AGENTS, 'i');
  } catch {
    // 잘못된 정규식이면 기본 패턴을 사용한다.
  }
}

function isLoopback(address?: string | null) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// 신뢰 프록시(nginx)가 마지막에 추가한 X-Forwarded-For 값만 사용한다.
// 클라이언트가 임의로 넣은 첫 번째 값(X-Forwarded-For 위조)으로는 제한을 우회할 수 없다.
function clientIp(req: Request) {
  const socketIp = req.socket?.remoteAddress ?? '';
  if (!isLoopback(socketIp)) return socketIp || 'unknown';

  const forwardedFor = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor ?? '';
  const hops = value.split(',').map((hop) => hop.trim()).filter(Boolean);
  return hops[hops.length - 1] || socketIp || 'unknown';
}

function rateLimitPolicy(path: string): RateLimitPolicy {
  if (path.startsWith('/api/v1/auth/')) {
    return { key: 'auth', limit: AUTH_RATE_LIMIT_MAX_REQUESTS };
  }
  if (DATA_HEAVY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return { key: 'data', limit: DATA_RATE_LIMIT_MAX_REQUESTS };
  }
  return { key: 'global', limit: RATE_LIMIT_MAX_REQUESTS };
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const policy = rateLimitPolicy(req.path);
  const key = `${clientIp(req)}:${policy.key}`;

  let bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (rateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
      const oldestKey = rateLimitBuckets.keys().next().value;
      if (oldestKey) rateLimitBuckets.delete(oldestKey);
    }
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  const remaining = Math.max(0, policy.limit - bucket.count);
  res.setHeader('RateLimit-Limit', String(policy.limit));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));

  if (bucket.count > policy.limit) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ message: 'Too many requests' });
    return;
  }

  next();
}

function blockCrawlers(req: Request, res: Response, next: NextFunction) {
  if (blockAiCrawlers && blockedBotPattern.test(String(req.headers['user-agent'] ?? ''))) {
    res.status(403).json({ message: 'Forbidden' });
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
  const httpInstance = app.getHttpAdapter().getInstance();
  httpInstance.set('trust proxy', 1);
  httpInstance.disable('x-powered-by');

  app.use(cookieParser());
  app.use(blockCrawlers);
  app.use(rateLimit);
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (req.path.startsWith('/api/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.setHeader('Cache-Control', 'no-store');
    }
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
