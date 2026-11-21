# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat && npm i -g pnpm@9.15.9
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json .npmrc* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @orcestra/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @orcestra/shared build && pnpm --filter @orcestra/api build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app /app
# Dados coletados (data/ejs.json, data/federacoes.json) para o seed dentro do container
COPY data/ejs.json data/federacoes.json /app/data/
WORKDIR /app/apps/api
EXPOSE 3001
# Aplica as migrations pendentes e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
