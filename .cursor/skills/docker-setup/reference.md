# Docker Setup Reference

## Next.js Multi-Stage Build

Standard pattern for Next.js standalone:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG MONGODB_URI
ARG MONGODB_DB
ENV MONGODB_URI=$MONGODB_URI
ENV MONGODB_DB=$MONGODB_DB
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

## Dev Compose with MongoDB

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/myinvestments
      - MONGODB_DB=myinvestments
    volumes:
      - ./src:/app/src
      - ./public:/app/public
    command: npm run dev
    depends_on:
      mongodb:
        condition: service_healthy

  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  mongodb_data:
```

## .dockerignore Gotchas

- **Dockerfile exclusion**: `Dockerfile*` in .dockerignore excludes the main Dockerfile from the build context. Docker may fail with "Dockerfile not found". Use `Dockerfile.dev` or `Dockerfile.*` to exclude only variants, or remove `Dockerfile` from exclusion.
- **Required exclusions**: `node_modules`, `.next`, `.env*`, `*.md` (except `!README.md`)

## Hot Reload on Linux

On Linux, file watching may not work with bind mounts. Add:

```yaml
environment:
  - CHOKIDAR_USEPOLLING=true
  - WATCHPACK_POLLING=true
```

## Common Commands

| Task | Command |
|------|---------|
| Build and run | `docker compose up -d --build` |
| Dev with logs | `docker compose up --build` |
| Rebuild no cache | `docker compose build --no-cache` |
| Stop and remove | `docker compose down` |
| View logs | `docker compose logs -f app` |
