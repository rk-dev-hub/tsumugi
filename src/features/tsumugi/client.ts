import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { AiFeature, AiOutcome, Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { fakeTsumugiResponse } from "./fake";

// AI アシスタント Tsumugi の呼び出しを一元化する。
// - Tsumugi は DB を書き換えない。ここで記録するのは利用ログとキャッシュだけ。
// - キー未設定・上限・タイムアウト・API エラー・拒否・不正な出力は、すべて ok:false で返し、
//   呼び出し側はテンプレート文にフォールバックする。

export type TsumugiResult<T> =
  { ok: true; data: T; cached: boolean } | { ok: false; reason: AiOutcome };

export type Effort = "low" | "medium" | "high";

export type TsumugiCall<S extends z.ZodType> = {
  feature: AiFeature;
  /** 利用者（回数制限と利用ログ用）。ワーカーは null。 */
  user: { id: string } | null;
  /** 固定のシステムプロンプト（キャッシュの対象） */
  system: string;
  /** サーバが組み立てたデータ（JSON にして <data> で囲んで渡す） */
  data: unknown;
  /** ユーザーが書いた自由文（指示ではなくデータとして渡す） */
  userText?: string;
  /** 構造化出力のスキーマ（API に渡す） */
  schema: S;
  effort?: Effort;
  maxTokens?: number;
  /** 指定すると、同じ入力の応答を DB にキャッシュする */
  cacheTtlSeconds?: number;
};

const TIMEOUT_MS = 20_000;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: TIMEOUT_MS,
    maxRetries: 1,
  });
  return client;
}

/** Tsumugi の AI 機能が使えるか（API キーが設定されているか、テスト用のフェイクか）。 */
export function isTsumugiAiEnabled(): boolean {
  return env.TSUMUGI_FAKE || Boolean(env.ANTHROPIC_API_KEY);
}

/** ユーザー入力を区切り文字で囲む。区切り文字そのものは無害化する。 */
export function wrapUntrusted(tag: string, text: string): string {
  const safe = text.replaceAll(/<\/?[a-z_]+>/gi, (m) =>
    m.replaceAll("<", "＜").replaceAll(">", "＞"),
  );
  return `<${tag}>\n${safe}\n</${tag}>`;
}

function buildUserContent(call: TsumugiCall<z.ZodType>): string {
  const parts = [wrapUntrusted("data", JSON.stringify(call.data))];
  if (call.userText !== undefined) {
    parts.push(wrapUntrusted("user_text", call.userText));
  }
  return parts.join("\n\n");
}

function cacheKeyOf(call: TsumugiCall<z.ZodType>, model: string): string {
  const h = createHash("sha256")
    .update(
      JSON.stringify([
        model,
        call.feature,
        call.system,
        call.data,
        call.userText ?? null,
      ]),
    )
    .digest("hex");
  return `${call.feature}:${h}`;
}

async function isRateLimited(
  user: TsumugiCall<z.ZodType>["user"],
): Promise<boolean> {
  if (!user) return false;
  // 1 人 1 日（直近 24 時間）の上限
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await prisma.aiUsageLog.count({
    where: {
      userId: user.id,
      createdAt: { gte: since },
      outcome: { not: "RATE_LIMITED" },
    },
  });
  return used >= env.TSUMUGI_AI_DAILY_LIMIT;
}

async function logUsage(
  call: TsumugiCall<z.ZodType>,
  outcome: AiOutcome,
  extra: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
  } = {},
): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        userId: call.user?.id ?? null,
        feature: call.feature,
        outcome,
        ...extra,
      },
    });
  } catch {
    // 利用ログの失敗で画面を壊さない
  }
}

export async function callTsumugi<S extends z.ZodType>(
  call: TsumugiCall<S>,
): Promise<TsumugiResult<z.infer<S>>> {
  const model = env.TSUMUGI_AI_MODEL;
  const api = getClient();
  if (!api && !env.TSUMUGI_FAKE)
    return { ok: false, reason: "FALLBACK_NO_KEY" };

  const key = call.cacheTtlSeconds ? cacheKeyOf(call, model) : null;
  if (key) {
    const hit = await prisma.aiCache.findUnique({ where: { key } });
    if (hit && hit.expiresAt > new Date()) {
      const parsed = call.schema.safeParse(hit.output);
      if (parsed.success) return { ok: true, data: parsed.data, cached: true };
    }
  }

  if (await isRateLimited(call.user)) {
    await logUsage(call, "RATE_LIMITED");
    return { ok: false, reason: "RATE_LIMITED" };
  }

  const started = Date.now();
  let output: unknown;
  let usage: { inputTokens?: number; outputTokens?: number; model?: string } =
    {};
  if (env.TSUMUGI_FAKE || !api) {
    output = fakeTsumugiResponse(call.feature, call.data, call.userText);
    usage = { model: "fake" };
  } else {
    try {
      const res = await api.messages.parse({
        model,
        max_tokens: call.maxTokens ?? 4000,
        system: [
          {
            type: "text",
            text: call.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildUserContent(call) }],
        output_config: {
          effort: call.effort ?? "low",
          format: zodOutputFormat(call.schema),
        },
      });
      usage = {
        model: res.model,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      };
      if (res.stop_reason === "refusal") {
        await logUsage(call, "REFUSAL", {
          ...usage,
          latencyMs: Date.now() - started,
        });
        return { ok: false, reason: "REFUSAL" };
      }
      if (res.stop_reason === "max_tokens") {
        await logUsage(call, "INVALID_OUTPUT", {
          ...usage,
          latencyMs: Date.now() - started,
        });
        return { ok: false, reason: "INVALID_OUTPUT" };
      }
      output = res.parsed_output;
    } catch (e) {
      const reason: AiOutcome =
        e instanceof Anthropic.APIConnectionTimeoutError
          ? "TIMEOUT"
          : "API_ERROR";
      // 例外の内容（キーや入力を含みうる）はログに出さない
      console.error(`[tsumugi] ${call.feature} failed: ${reason}`);
      await logUsage(call, reason, { model, latencyMs: Date.now() - started });
      return { ok: false, reason };
    }
  }

  const parsed = call.schema.safeParse(output);
  const latencyMs = Date.now() - started;
  if (!parsed.success) {
    await logUsage(call, "INVALID_OUTPUT", { ...usage, latencyMs });
    return { ok: false, reason: "INVALID_OUTPUT" };
  }
  await logUsage(call, "OK", { ...usage, latencyMs });
  if (key && call.cacheTtlSeconds) {
    const expiresAt = new Date(Date.now() + call.cacheTtlSeconds * 1000);
    const value = parsed.data as Prisma.InputJsonValue;
    await prisma.aiCache.upsert({
      where: { key },
      create: { key, feature: call.feature, output: value, expiresAt },
      update: { output: value, expiresAt },
    });
  }
  return { ok: true, data: parsed.data, cached: false };
}
