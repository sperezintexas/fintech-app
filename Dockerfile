# App Runner runs linux/amd64 only. Pinning platform avoids exec format error.
FROM --platform=linux/amd64 node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ARG MONGODB_URI=placeholder
ARG MONGODB_DB=myinvestments
ENV MONGODB_URI=$MONGODB_URI MONGODB_DB=$MONGODB_DB
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

FROM --platform=linux/amd64 node:22-alpine
WORKDIR /app

# Security: non-root user (production-ready)
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# App Runner / containers: must listen on 0.0.0.0 so health check can reach the app
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
# Explicit host at runtime so health check from App Runner always reaches the server
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
