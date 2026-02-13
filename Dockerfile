# Multi-stage build: pnpm workspace (apps/frontend = Next.js), non-root user, pm2 (web + smart-scheduler).
# See .cursor/rules/docker-optimization.mdc and docs/docker-optimization-plan.md.
# For local (ARM Mac): builds native arm64. For App Runner: build with --platform linux/amd64.
# ── Builder ───────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/smart-scheduler/package.json ./apps/smart-scheduler/
RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY config ./config
ARG MONGODB_URI=placeholder
ARG MONGODB_DB=myinvestments
ENV MONGODB_URI=$MONGODB_URI MONGODB_DB=$MONGODB_DB
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm run build

RUN pnpm prune --prod

# ── Runner ────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Security: non-root user (mandatory)
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

# Copy workspace and built frontend (no root src/public; they live in apps/frontend)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./
COPY --from=builder --chown=nextjs:nodejs /app/apps ./apps
COPY --from=builder --chown=nextjs:nodejs /app/config ./config

# pm2-runtime for multi-process (web + scheduler)
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --chown=nextjs:nodejs ecosystem.config.js ./

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["pm2-runtime", "start", "ecosystem.config.js"]
