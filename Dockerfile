# Multi-stage build: pnpm, non-root user, pm2 (web + smart-scheduler).
# See .cursor/rules/docker-optimization.mdc and docs/docker-optimization-plan.md.
# For local (ARM Mac): builds native arm64. For App Runner: build with --platform linux/amd64.
# ── Builder ───────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
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

# Copy only needed files (no devDependencies, no .git / tests)
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/apps ./apps
COPY --from=builder --chown=nextjs:nodejs /app/config ./config

# pm2-runtime for multi-process (web + scheduler)
RUN npm install -g pm2@5
COPY --chown=nextjs:nodejs ecosystem.config.js ./

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["pm2-runtime", "start", "ecosystem.config.js"]
