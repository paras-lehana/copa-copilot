# Multi-stage, non-root web image using Next.js standalone output.
# Built from the repo root so @copa/core resolves during the build.
FROM node:20-alpine@sha256:d3507a213936fe4ef54760a186e113db5188472d9efdf491686bd94580a1c1e8 AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
# Core must be built (dist) before Next resolves @copa/core.
ARG API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=${API_BASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @copa/core && npm run build -w @copa/web

FROM node:20-alpine@sha256:d3507a213936fe4ef54760a186e113db5188472d9efdf491686bd94580a1c1e8 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# The standalone server bundles its own node_modules; copy it plus static assets.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
