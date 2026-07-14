# Multi-stage, non-root API image. Built from the repo root so the @copa/core
# workspace is available. Base pinned by digest (Node 20 LTS Alpine).
FROM node:20-alpine@sha256:d3507a213936fe4ef54760a186e113db5188472d9efdf491686bd94580a1c1e8 AS build
WORKDIR /repo
# Install with the full workspace graph so @copa/core resolves.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run build -w @copa/core && npm run build -w @copa/api

FROM node:20-alpine@sha256:d3507a213936fe4ef54760a186e113db5188472d9efdf491686bd94580a1c1e8 AS runtime
WORKDIR /repo
ENV NODE_ENV=production
# Copy installed deps + built output; prune dev deps for a lean runtime image.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /repo/packages/core/dist packages/core/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
# Cloud Run injects PORT (defaults 8080). Run as the built-in non-root node user.
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
