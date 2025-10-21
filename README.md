# Treasureby Backend API

Production-ready NestJS backend infrastructure for the Treasureby digital asset marketplace platform.

## Features Implemented

### Core Infrastructure
- NestJS 11+ with modular architecture following SOLID principles
- TypeScript Strict Mode for maximum type safety
- PostgreSQL + Prisma ORM for type-safe database access
- Cloudflare R2 (S3-compatible) storage for file uploads
- Redis Cache for performance optimization
- Environment Configuration for development and production

### Authentication & Security
- JWT Authentication with access tokens (15min) and refresh tokens (7 days)
- Google OAuth integration (optional)
- Role-Based Access Control (RBAC) with custom decorators
- Helmet for HTTP security headers
- CORS configuration
- Rate Limiting with ThrottlerModule
- Request Validation using class-validator on all DTOs

### API Features
- OpenAPI/Swagger documentation at /api/docs
- Centralized Error Handling with custom exception filters
- Standardized Pagination (page, limit, sort, order, search)
- Soft Delete functionality with deletedAt timestamp
- Global Validation Pipe with DTO transformation

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run database migrations:
```bash
npx prisma migrate dev
```

4. Start development server:
```bash
npm run start:dev
```

5. Access API documentation:
- Server: http://localhost:3000
- Swagger: http://localhost:3000/api/docs

## Environment Variables

See .env.example for all required configuration options.

Key variables:
- DATABASE_URL - PostgreSQL connection string
- JWT_ACCESS_SECRET - JWT access token secret
- JWT_REFRESH_SECRET - JWT refresh token secret
- REDIS_HOST - Redis server host (optional)
- R2_* - Cloudflare R2 storage credentials (optional)

## API Endpoints

### Authentication
- POST /api/auth/register - Register new user
- POST /api/auth/login - Login user
- POST /api/auth/refresh - Refresh access token
- POST /api/auth/logout - Logout user
- GET /api/auth/profile - Get current user (protected)

Full API documentation available at /api/docs when running.

## Build & Deploy

```bash
npm run build    # Build for production
npm run start:prod  # Run in production mode
```

Built with NestJS 11+ - TypeScript Strict Mode - Production Ready
