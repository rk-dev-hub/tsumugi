# docker compose up で使うイメージ（next start）。
FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_HOME=/opt/corepack \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate \
  && chmod -R a+rX /opt/corepack
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# ビルド時だけ使うダミー値（実行時は docker-compose.yml の値が使われる）
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-only-dummy-secret-0123456789abcdef" \
    sh -c "pnpm prisma generate && pnpm build"

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.secrets && chown node:node /app/.secrets && chmod 700 /app/.secrets
USER node
EXPOSE 3300
CMD ["sh", "scripts/docker-entrypoint.sh"]
