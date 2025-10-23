# ---------- Build Stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source files and build
COPY . .
RUN npm run build
RUN npx prisma generate

# ---------- Production Stage ----------
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Install only production deps
RUN npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/main.js"]
