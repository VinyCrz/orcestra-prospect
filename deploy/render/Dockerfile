# syntax=docker/dockerfile:1
# Imagem única para o Render grátis: API (NestJS, porta interna 3001) + front (Next.js, porta $PORT).
# O front fala com a API por http://127.0.0.1:3001 (proxy /api/*), então tudo fica na mesma origem.
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat && npm i -g pnpm@9.15.9
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json .npmrc* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @orcestra/api... --filter @orcestra/web...
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @orcestra/shared build \
 && pnpm --filter @orcestra/api build \
 && pnpm --filter @orcestra/web build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# API (precisa dos node_modules do workspace: Prisma, argon2 etc.)
COPY --from=build /app /app
# Front (build standalone do Next)
COPY --from=build /app/apps/web/.next/standalone /web
COPY --from=build /app/apps/web/.next/static /web/apps/web/.next/static
COPY --from=build /app/apps/web/public /web/apps/web/public
# Dados para o seed
COPY data/ejs.json data/federacoes.json /app/data/
COPY deploy/render/iniciar.sh /iniciar.sh
RUN chmod +x /iniciar.sh && rm -rf /app/apps/web/.next/cache
EXPOSE 3000
CMD ["/iniciar.sh"]
