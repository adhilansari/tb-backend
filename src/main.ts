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

  // 🌍 API prefix (default: /api)
  const apiPrefix = configService.get('API_PREFIX') || 'api';
  app.setGlobalPrefix(apiPrefix);

  // 🛡️ Security Middleware
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      contentSecurityPolicy: false, // disable CSP for APIs
    }),
  );

  // 🌐 CORS Configuration
  const allowedOrigins = [
    'https://treasureby.vercel.app',
    'https://www.treasureby.com',
    'https://treasureby.com',
    'http://localhost:4200',
    'http://localhost:3000',
  ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

  // 🧹 Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ⚠️ Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // 📘 Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Treasureby API')
    .setDescription('REST API for Treasureby - Digital Asset Marketplace Platform')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .addTag('Authentication')
    .addTag('Users')
    .addTag('Assets')
    .addTag('Search')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  // ⚙️ Determine Port and Host for Fly.io or Local
  const port = Number(process.env.PORT || configService.get('PORT') || 8080);
  const host = process.env.FLY_APP_NAME ? '0.0.0.0' : '127.0.0.1';

  // ✅ Fix TypeScript error (explicit type cast)
  await app.listen(port, host as string);

  // 🖥️ Logs
  const protocol = process.env.FLY_APP_NAME ? 'https' : 'http';
  console.log(`🚀 Treasureby API Server running on ${protocol}://${host}:${port}/${apiPrefix}`);
  console.log(`📚 Swagger Docs: ${protocol}://${host}:${port}/${apiPrefix}/docs`);
  console.log(`🔐 CORS Allowed: ${allowedOrigins.join(', ')}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();
