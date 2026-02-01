---
name: docker-setup
description: Analyze Dockerfile and docker-compose.yml for build/run issues, optimize for dev (hot reload, volumes), ensure MongoDB and Yahoo Finance integration. Use when working with Docker, containerizing Next.js apps, or when the user mentions Docker build/run problems, dev environment, or docker-compose.
---

# Docker Setup

## Instructions

When asked to analyze or fix Docker setup:

1. **Read** `Dockerfile` and `docker-compose.yml`
2. **Check** `.dockerignore` (ensure Dockerfile isn't excluded; exclude node_modules, .next, .env)
3. **Apply** fixes from the checklist below
4. **Output**:
   - Updated files as unified diff
   - Docker commands to run (e.g. `docker compose up -d --build`)

## Analysis Checklist

### Build / Run Fixes

- [ ] **Next.js standalone**: `next.config.ts` must have `output: "standalone"` for multi-stage Dockerfile
- [ ] **Build args**: Pass `MONGODB_URI`, `MONGODB_DB` (and other build-time vars) via `ARG` in Dockerfile and `args` in docker-compose `build`
- [ ] **Runtime env**: App needs `MONGODB_URI`, `MONGODB_DB` at runtime; add `XAI_API_KEY`, `WEB_SEARCH_API_KEY` if Grok/chat features exist
- [ ] **Health check**: Use `wget` or `curl` against `/api/health`; ensure endpoint exists
- [ ] **.dockerignore**: Never exclude `Dockerfile`; always exclude `node_modules`, `.next`, `.env*`, `*.md` (except README)

### Dev Optimizations

- [ ] **Hot reload**: Use `next dev` in dev; mount source with volume; set `CHOKIDAR_USEPOLLING=true` if on Linux
- [ ] **Volumes**: Mount `./src` and `./public` (or `.` for full source) into app container
- [ ] **Dev profile**: Add `docker-compose.dev.yml` or `profiles: [dev]` for dev-only services (MongoDB)
- [ ] **Ports**: Expose 3000 for Next.js

### MongoDB Integration

- [ ] **Local MongoDB**: Add `mongodb` service in docker-compose for local dev; use `mongodb://mongodb:27017/myinvestments` as `MONGODB_URI`
- [ ] **App depends_on**: `depends_on: mongodb` (or `mongodb: condition: service_healthy`)
- [ ] **MongoDB health**: `mongosh --eval "db.adminCommand('ping')"` or `mongo --eval "db.adminCommand('ping')"`

### Yahoo Finance / External APIs

- [ ] **yahoo-finance2**: No API key; ensure container has outbound network (default)
- [ ] **Optional APIs**: Pass `XAI_API_KEY`, `WEB_SEARCH_API_KEY` via env for Grok/SerpAPI

## Output Format

```markdown
## Changes

### Dockerfile
\`\`\`diff
...unified diff...
\`\`\`

### docker-compose.yml
\`\`\`diff
...unified diff...
\`\`\`

## Commands

\`\`\`bash
docker compose up -d --build
# or for dev with hot reload:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
\`\`\`
```

## Quick Reference

- **Production build**: `docker compose up -d --build`
- **Dev with MongoDB**: Add mongodb service; `MONGODB_URI=mongodb://mongodb:27017/myinvestments`
- **Dev hot reload**: Use `next dev`, volume mount source, `CHOKIDAR_USEPOLLING=true` on Linux

For detailed patterns, see [reference.md](reference.md).
