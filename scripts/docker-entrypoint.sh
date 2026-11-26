#!/bin/sh
# docker compose up 用の起動スクリプト。マイグレーションのあと、DB が空なら体験用データを入れてから起動する。
set -e

# AUTH_SECRET はセッションの署名鍵と 2 段階認証のシークレットの暗号化鍵。
# 固定のダミー値を使わないよう、未設定（または .env.example のダミーのまま）なら
# 初回にランダムな値を作ってボリュームに保存し、以降はそれを使う。
if [ -z "${AUTH_SECRET:-}" ] || [ "$AUTH_SECRET" = "dummy-dummy-dummy-dummy-dummy-dummy-32ch" ]; then
  SECRET_FILE=/app/.secrets/auth-secret
  if [ ! -s "$SECRET_FILE" ]; then
    (umask 077 && node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))' > "$SECRET_FILE")
  fi
  AUTH_SECRET="$(cat "$SECRET_FILE")"
  export AUTH_SECRET
fi

pnpm prisma migrate deploy

# seed は既存ユーザーのパスワードを初期値に戻すため、DB が空のときだけ流す
if pnpm exec tsx scripts/db-is-empty.ts; then
  echo "体験用データを投入します"
  pnpm db:seed
fi

exec pnpm start
