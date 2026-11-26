import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ipDoProxy } from './common/ip-do-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  // Atrás do proxy do web (1 salto): req.ip = IP que o proxy escreveu em X-Forwarded-For.
  app.set('trust proxy', 1);
  // Em provedores separados (Netlify → Render) há saltos a mais: o proxy do web informa o IP real
  // num cabeçalho autenticado por PROXY_SECRET (sem o segredo, o cabeçalho é ignorado).
  app.use(ipDoProxy(config.get<string>('PROXY_SECRET')));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  const origens = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Sem origens configuradas, o CORS fica desligado (o navegador usa o proxy do web, mesma origem).
  app.enableCors({ origin: origens.length ? origens : false, credentials: true });
  app.enableShutdownHooks();

  const producao = config.get<string>('NODE_ENV') === 'production';
  if (!producao) {
    const doc = new DocumentBuilder()
      .setTitle("Orce'estra Prospect API")
      .setDescription('API interna de prospecção B2B de Empresas Juniores')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  const port = config.get<number>('API_PORT') ?? 3001;
  await app.listen(port, '0.0.0.0');
  Logger.log(
    producao
      ? `API em http://localhost:${port} (Swagger desligado em produção)`
      : `API em http://localhost:${port} — Swagger em http://localhost:${port}/docs`,
    'Bootstrap',
  );
}
void bootstrap();
