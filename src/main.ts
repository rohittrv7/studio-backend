import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validateEnvironment } from './config/env.validation';

/** Dev CORS patterns: localhost, LAN IPs, Android emulator, ngrok tunnels. */
const DEV_CORS_PATTERNS = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/10\.0\.2\.2(:\d+)?$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/,
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.dev$/,
  /^https:\/\/[a-z0-9-]+\.ngrok\.io$/,
  /^https:\/\/[a-z0-9-]+\.ngrok\.app$/,
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // High payload body limits for base64 media and photos
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  const configService = app.get(ConfigService);
  validateEnvironment(configService);

  // Security headers via helmet
  app.use(helmet());

  // Trust the first proxy hop (e.g. nginx / load balancer)
  const httpAdapter = app.getHttpAdapter().getInstance() as {
    set(setting: string, value: unknown): void;
  };
  httpAdapter.set('trust proxy', 1);

  // Global exception filter — must come before the validation pipe
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe with strict settings
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // All routes are served under /api/v1
  app.setGlobalPrefix('api/v1');

  // Swagger / OpenAPI setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Photography Studio QR Gallery API')
    .setDescription(
      'API for managing galleries, media, QR codes, and customer access',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Always expose the raw OpenAPI JSON spec in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    app.getHttpAdapter().get(
      '/api/docs-json',
      (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json(document);
      },
    );
  }

  // Mount the interactive Swagger UI only in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, document);
  }

  // CORS — in development allow localhost, LAN, emulator, and ngrok origins.
  // In production restrict to the comma-separated ALLOWED_ORIGINS env var.
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    const rawOrigins = process.env.ALLOWED_ORIGINS;
    const origin = rawOrigins ? rawOrigins.split(',').map((o) => o.trim()) : [];
    app.enableCors({ origin, credentials: true });
  } else {
    app.enableCors({
      origin: (
        requestOrigin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (
          !requestOrigin ||
          DEV_CORS_PATTERNS.some((pattern) => pattern.test(requestOrigin))
        ) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${requestOrigin} not allowed by CORS`));
      },
      credentials: true,
    });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
}

bootstrap();
