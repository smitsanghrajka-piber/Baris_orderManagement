import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { assertRoutesAnnotated } from './common/auth/assert-routes-annotated';

function assertEnv() {
  const required = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(`FATAL: missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET!.length < 32 || /change-me|dev-only/.test(process.env.JWT_SECRET!))) {
    console.error('FATAL: JWT_SECRET must be a long random value in production.');
    process.exit(1);
  }
}

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['log', 'error', 'warn'] });
  app.set('trust proxy', 1);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: true, credentials: false });
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co', 'https://*.supabase.in'],
        'connect-src': ["'self'", 'https://*.supabase.co', 'https://*.supabase.in'],
        'worker-src': ["'self'", 'blob:'],
        'object-src': ["'none'"],
        'frame-src': ["'self'", 'blob:'],
        'frame-ancestors': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ limit: '2mb', extended: true }));

  // Static SPA before the API prefix; explicit cache policy; asset-shaped 404s never fall through to index.html.
  const publicPath = ['/app/public', join(__dirname, '..', '..', 'frontend', 'dist'), join(process.cwd(), 'frontend', 'dist')].find(existsSync);
  if (publicPath) {
    app.use(express.static(publicPath, {
      setHeaders: (res, filePath) => {
        const name = filePath.replace(/\\/g, '/');
        if (/\/index\.html$/.test(name)) res.setHeader('Cache-Control', 'no-cache');
        else if (/\/assets\//.test(name)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
  }
  app.setGlobalPrefix('api/v1');
  const ASSET_EXT = /\.(?:js|mjs|css|map|json|webmanifest|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|txt|xml|wasm)$/i;
  if (publicPath) {
    const indexHtml = join(publicPath, 'index.html');
    app.use((req: any, res: any, next: any) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/docs')) return next();
      if (req.method !== 'GET' || ASSET_EXT.test(req.path)) return next();
      if (existsSync(indexHtml)) return res.sendFile(indexHtml);
      next();
    });
  }

  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER === '1') {
    const config = new DocumentBuilder().setTitle('Baris IML API').setDescription('Artwork, quotation, order, production and dispatch management').setVersion('0.2').addBearerAuth().build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  assertRoutesAnnotated(app);
  return { app, publicPath };
}

async function bootstrap() {
  assertEnv();
  const { app, publicPath } = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  const log = new Logger('Bootstrap');
  log.log(`Baris IML API listening on ${port} — API /api/v1, docs /docs${publicPath ? `, SPA from ${publicPath}` : ''}`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('STARTUP ERROR:', err);
    process.exit(1);
  });
}
