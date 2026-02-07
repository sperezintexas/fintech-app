FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ARG MONGODB_URI=placeholder
ARG MONGODB_DB=myinvestments
ENV MONGODB_URI=$MONGODB_URI MONGODB_DB=$MONGODB_DB
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
