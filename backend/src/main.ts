import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';

export function validateProductionSecurityConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const jwt = env.JWT_SECRET ?? '';
  if (jwt.length < 32 || jwt === 'dev-secret-key-1234!') throw new Error('Production requires a strong JWT_SECRET');
  if (!(env.PORTONE_WEBHOOK_SECRET ?? '').trim()) throw new Error('Production requires PORTONE_WEBHOOK_SECRET');
  const origins = [env.FRONTEND_URL ?? '', ...(env.FRONTEND_URLS ?? '').split(',')].map(v => v.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => !origin.startsWith('https://'))) throw new Error('Production requires HTTPS frontend origins');
}

async function bootstrap() {
  validateProductionSecurityConfig();
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());
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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
