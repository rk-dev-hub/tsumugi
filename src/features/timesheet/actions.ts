"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActor, isErr } from "@/features/auth/rbac";
import { err, type Result } from "@/lib/result";
import { fieldErrors } from "@/lib/zod";
import {
  attendanceInputSchema,
  clearAttendance,
  createEntries,
  createEntry,
  deleteEntry,
  discardTimer,
  entryInputSchema,
  saveAttendance,
  startTimer,
  stopTimer,
  updateEntry,
} from "./usecase";
import { submitPeriod, withdrawPeriod } from "@/features/approval/usecase";

export type ActionResult = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
  index?: number;
};

function toAction(
  r: Result<unknown> & { index?: number },
  success?: string,
): ActionResult {
  if (r.ok) return { ok: true, message: success };
  return {
    ok: false,
    message: r.error.message,
    fields: r.error.fields,
    index: r.index,
  };
}

function done() {
  revalidatePath("/timesheet");
  revalidatePath("/");
}

export async function saveEntryAction(
  id: string | null,
  raw: unknown,
): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  const parsed = entryInputSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      message: "入力内容を確認してください。",
      fields: fieldErrors(parsed.error),
    };
  if (id !== null && !z.string().uuid().safeParse(id).success)
    return toAction(err("NOT_FOUND"));
  const r = id
    ? await updateEntry(actor.id, id, parsed.data)
    : await createEntry(actor.id, parsed.data);
  done();
  return toAction(r);
}

export async function saveEntriesAction(raw: unknown): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  const parsed = z.array(entryInputSchema).min(1).max(30).safeParse(raw);
  if (!parsed.success)
    return { ok: false, message: "対象・時刻が未選択の行があります。" };
  const r = await createEntries(actor.id, parsed.data);
  done();
  return toAction(r, `${parsed.data.length} 件の工数を登録しました。`);
}

export async function deleteEntryAction(id: string): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  if (!z.string().uuid().safeParse(id).success)
    return toAction(err("NOT_FOUND"));
  const r = await deleteEntry(actor.id, id);
  done();
  return toAction(r);
}

export async function saveAttendanceAction(
  raw: unknown,
): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  const parsed = attendanceInputSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      message: "勤務時間を確認してください。",
      fields: fieldErrors(parsed.error),
    };
  const r = await saveAttendance(actor.id, parsed.data);
  done();
  return toAction(r, "勤務時間を保存しました。");
}

export async function clearAttendanceAction(
  date: string,
): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toAction(err("VALIDATION"));
  const r = await clearAttendance(actor.id, date);
  done();
  return toAction(r);
}

const timerSchema = z.object({
  phaseId: z.string().uuid("工程を選んでください"),
  workCategoryId: z
    .union([z.literal("").transform(() => null), z.string().uuid(), z.null()])
    .optional()
    .transform((v) => v ?? null),
  note: z.string().max(500).default(""),
});

export async function startTimerAction(raw: unknown): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  const parsed = timerSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, message: "プロジェクトと工程を選んでください。" };
  const r = await startTimer(actor.id, parsed.data);
  revalidatePath("/", "layout");
  return toAction(r, "タイマーを開始しました。");
}

export async function stopTimerAction(): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  const r = await stopTimer(actor.id);
  revalidatePath("/", "layout");
  if (r.ok)
    return {
      ok: true,
      message:
        r.value.minutes > 0
          ? "タイマーを止めて工数に記録しました。"
          : "1 分未満のため記録しませんでした。",
    };
  return toAction(r);
}

export async function discardTimerAction(): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  const r = await discardTimer(actor.id);
  revalidatePath("/", "layout");
  return toAction(r, "タイマーを破棄しました。");
}

export async function submitPeriodAction(date: string): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toAction(err("VALIDATION"));
  const r = await submitPeriod(actor, date);
  done();
  return toAction(r, "提出しました。");
}

export async function withdrawPeriodAction(
  date: string,
): Promise<ActionResult> {
  const actor = await getActor();
  if (isErr(actor)) return toAction(actor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toAction(err("VALIDATION"));
  const r = await withdrawPeriod(actor, date);
  done();
  return toAction(r, "取り下げました。");
}
