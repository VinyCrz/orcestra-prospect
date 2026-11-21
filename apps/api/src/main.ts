import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGINS')!
      .split(',')
      .map((s) => s.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle("Orce'estra Prospect API")
    .setDescription('API interna de prospecção B2B de Empresas Juniores')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));

  const port = config.get<number>('API_PORT') ?? 3001;
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `API em http://localhost:${port} — Swagger em http://localhost:${port}/docs`,
    'Bootstrap',
  );
}
void bootstrap();
