# Tsumugi

一言のメモから工数の下書きを作り、予算の見通しをわかりやすく伝える、チームの工数・予実管理アプリです。
タイムラインで工数を記録し、週ごとの提出・承認と月次の締めで確定します。プロジェクトの予算消化率・着地見込み・原価・粗利をリアルタイムに確認できます。

アプリの中の AI アシスタント「Tsumugi」が、次のことを手伝います。

- **ひとことで記録** … 「9時半から A 社定例 1 時間、お昼までデザイン修正、午後はコーディング」と書くと、その日の工数の下書きを作る
- **予算の見通しコメント** … 予算超過の兆しがあるプロジェクトについて、理由と次の一手を短く説明する
- **承認の要約** … 提出された 1 週間の工数を要約し、勤務時間との差や深夜作業など気になる点を示す
- **月次採算レポートの下書き** … 締めた月の工数・人件費・粗利をもとに、報告用の文章を下書きする

集計や予算の判定は AI を使わずに計算しています。AI は文章を作る部分だけに使い、下書きは人が確認してから登録します。

## 起動

Docker が必要です。

```bash
git clone https://github.com/rk-dev-hub/tsumugi.git
cd tsumugi
docker compose up
```

初回はビルドと体験用データの投入に数分かかります。起動したら http://localhost:3300 を開いてください。

| ロール       | メールアドレス      | パスワード       |
| ------------ | ------------------- | ---------------- |
| 管理者       | admin@example.com   | TsumugiDemo#2026 |
| マネージャー | manager@example.com | TsumugiDemo#2026 |
| メンバー     | member@example.com  | TsumugiDemo#2026 |

- 架空の制作会社「アオバ制作」の 18 名・約 6 か月分の工数が入っています。
- ポートが使用中の場合は `APP_PORT=3400 DB_PORT=5440 docker compose up` のように変更できます。
- 停止は `Ctrl+C`、データごと消す場合は `docker compose down -v` です。

## AI 機能を使う

AI 機能を使うには Claude API の API キーが必要です。[Claude Console](https://platform.claude.com/) で発行し、`.env` に設定してから起動し直してください。

```bash
cp .env.example .env
# .env の ANTHROPIC_API_KEY に発行したキーを書く
docker compose up
```

API キーを設定しない場合も、ひとことで記録以外の機能はテンプレートの文面で動きます。
API の利用料金は発行したアカウントに請求されます。1 人 1 日あたりの利用回数に上限を設けており、`.env` の `TSUMUGI_AI_DAILY_LIMIT` で変更できます。

## 開発

Node.js 24 と pnpm 10 を使います。

```bash
cp .env.example .env
docker compose up -d db
pnpm install
pnpm db:deploy && pnpm db:seed
pnpm dev
```

| コマンド                | 内容                                         |
| ----------------------- | -------------------------------------------- |
| `pnpm verify`           | 型チェック・lint・単体テスト                 |
| `pnpm test:integration` | DB を使う結合テスト（`tsumugi_test` を使用） |
| `pnpm test:e2e`         | E2E テスト（`tsumugi_e2e` を使用）           |
| `pnpm db:seed --reset`  | 体験用データを入れ直す（全データを消去）     |
| `pnpm create:admin`     | 体験用データなしで管理者だけを作る           |

## 技術スタック

Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 / Auth.js v5 / PostgreSQL 16 / Prisma 7 / Claude API / Vitest / Playwright
