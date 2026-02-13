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

# Next.js standalone does not copy public/ by default; ensure broker logos (public/logos/) and other static assets are in standalone output
RUN if [ -d apps/frontend/.next/standalone ]; then \
  cp -r apps/frontend/public apps/frontend/.next/standalone/apps/frontend/ 2>/dev/null || true; \
  mkdir -p apps/frontend/.next/standalone/apps/frontend/.next && \
  cp -r apps/frontend/.next/static apps/frontend/.next/standalone/apps/frontend/.next/ 2>/dev/null || true; \
fi

RUN pnpm prune --prod

# ── Runner ────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Security: non-root user (mandatory)
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

# Copy workspace and built frontend. apps/frontend/public (broker logos, icons) is included for static serving.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./
COPY --from=builder --chown=nextjs:nodejs /app/apps ./apps
COPY --from=builder --chown=nextjs:nodejs /app/config ./config

# pm2-runtime for multi-process (web + scheduler). Use full path so platforms that run "node <cmd>" don't resolve pm2-runtime to /app/pm2-runtime.
RUN corepack enable && corepack prepare pnpm@9 --activate && npm install -g pm2@5
COPY --chown=nextjs:nodejs ecosystem.config.js ./

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# ENTRYPOINT ensures we exec pm2-runtime directly; CMD args are passed to it (avoids "node pm2-runtime" → Cannot find module '/app/pm2-runtime').
ENTRYPOINT ["/usr/local/bin/pm2-runtime"]
CMD ["start", "ecosystem.config.js"]
