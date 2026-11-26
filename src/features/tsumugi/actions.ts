"use server";

import { z } from "zod";
import { getActor, isErr } from "@/features/auth/rbac";
import { draftEntries, type DraftOutcome } from "./tasks";

const schema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "やったことを書いてください")
    .max(500, "500 文字までです"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  previousQuestion: z.string().max(200).optional(),
});

export async function draftEntriesAction(raw: unknown): Promise<DraftOutcome> {
  const actor = await getActor();
  if (isErr(actor))
    return { kind: "UNAVAILABLE", message: "ログインし直してください。" };
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return {
      kind: "UNAVAILABLE",
      message: parsed.error.issues[0]?.message ?? "入力を確認してください。",
    };
  return draftEntries(actor, parsed.data);
}
