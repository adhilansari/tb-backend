import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);

  const apiPrefix = configService.get('API_PREFIX', 'api');
  app.setGlobalPrefix(apiPrefix);

  // 🛡️ Helmet Security
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameSrc: ["'self'"],
        },
      },
    }),
  );

  // 🌐 Enable CORS
  app.enableCors({
    origin: [
      configService.get('CORS_ORIGIN', 'https://treasureby.vercel.app'),
      'http://localhost:4200',
      'http://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'Access-Control-Allow-Origin',
    ],
    exposedHeaders: ['Content-Disposition', 'Content-Length'],
    maxAge: 3600,
  });

  // 🧹 Global Pipes & Filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // 📘 Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Treasureby API')
    .setDescription('REST API for Treasureby - Digital Asset Marketplace Platform')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'JWT',
    )
    .addTag('Authentication')
    .addTag('Users')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  // ⚙️ Determine Port & Host
  const port = configService.get('PORT', 3000);
  const host = process.env.FLY_APP_NAME ? '0.0.0.0' : 'localhost'; // 👈 Detect Fly.io

  await app.listen(port, host);

  // 🖥️ Logs
  console.log(`🚀 Treasureby API Server running on http://${host}:${port}/${apiPrefix}`);
  console.log(`📚 Swagger Docs available at http://${host}:${port}/${apiPrefix}/docs`);
  console.log(`🔐 CORS enabled for: ${configService.get('CORS_ORIGIN', 'https://treasureby.vercel.app')}`);
}

bootstrap();
