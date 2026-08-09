import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import type { Environment } from './config/environment';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Environment, true>);
  const logger = new Logger('Bootstrap');

  app.useLogger(
    config.get('LOG_LEVEL', { infer: true }) === 'debug'
      ? ['error', 'warn', 'log', 'debug']
      : ['error', 'warn', 'log'],
  );
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy:
        config.get('NODE_ENV', { infer: true }) === 'production' ? undefined : false,
    }),
  );
  app.use(compression());

  const allowedOrigins = new Set(
    config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
  );
  app.enableCors({
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.has(origin)) callback(null, true);
      else callback(new Error('Origin not allowed'));
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Atlas AI API')
    .setDescription('Consent-based location sharing, safety, trips, chat, and AI insights')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('v1/docs', app, document, {
    customSiteTitle: 'Atlas AI API',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });

  const socketAdapter = new RedisIoAdapter(app, config);
  try {
    await socketAdapter.connectToRedis();
    app.useWebSocketAdapter(socketAdapter);
  } catch (error) {
    if (config.get('NODE_ENV', { infer: true }) === 'production') throw error;
    logger.warn('Redis Socket.IO adapter unavailable; using single-instance in-memory adapter');
  }

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log(`Atlas AI API listening on port ${port}`);
}

void bootstrap();
