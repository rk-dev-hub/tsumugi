"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActor, getManagerActor, isErr } from "@/features/auth/rbac";
import {
  addExpense,
  createProject,
  deleteExpense,
  expenseInputSchema,
  phaseInputSchema,
  projectInputSchema,
  savePhases,
  updateProject,
} from "@/features/project/usecase";
import { fieldErrors } from "@/lib/zod";
import type { Result } from "@/lib/result";

export type FormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
} | null;

const uuid = z.string().uuid();

function fail(r: Result<unknown>): FormState {
  return r.ok
    ? { ok: true }
    : { ok: false, message: r.error.message, fields: r.error.fields };
}

function projectFromForm(fd: FormData) {
  return projectInputSchema.safeParse({
    code: fd.get("code"),
    name: fd.get("name"),
    kind: fd.get("kind"),
    status: fd.get("status") ?? undefined,
    clientId: fd.get("clientId") ?? "",
    pmId: fd.get("pmId") ?? "",
    startDate: fd.get("startDate"),
    endDate: fd.get("endDate") ?? "",
    revenueAmount: fd.get("revenueAmount") ?? "",
    colorIndex: fd.get("colorIndex") ?? 0,
    note: fd.get("note") ?? "",
    memberIds: fd.getAll("memberIds"),
  });
}

export async function createProjectAction(
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  const actor = await getManagerActor();
  if (isErr(actor)) return fail(actor);
  const parsed = projectFromForm(fd);
  if (!parsed.success)
    return {
      ok: false,
      message: "入力内容を確認してください。",
      fields: fieldErrors(parsed.error),
    };
  const r = await createProject(actor, parsed.data);
  if (!r.ok) return fail(r);
  revalidatePath("/projects");
  redirect(`/projects/${r.value.id}/edit?created=1`);
}

export async function updateProjectAction(
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  const actor = await getActor();
  if (isErr(actor)) return fail(actor);
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, message: "対象が見つかりません。" };
  const parsed = projectFromForm(fd);
  if (!parsed.success)
    return {
      ok: false,
      message: "入力内容を確認してください。",
      fields: fieldErrors(parsed.error),
    };
  const r = await updateProject(actor, id.data, parsed.data);
  if (!r.ok) return fail(r);
  revalidatePath("/projects");
  revalidatePath(`/projects/${id.data}`);
  return { ok: true, message: "保存しました。" };
}

export async function savePhasesAction(
  projectId: string,
  raw: unknown,
): Promise<FormState> {
  const actor = await getActor();
  if (isErr(actor)) return fail(actor);
  if (!uuid.safeParse(projectId).success)
    return { ok: false, message: "対象が見つかりません。" };
  const parsed = z.array(phaseInputSchema).max(50).safeParse(raw);
  if (!parsed.success)
    return { ok: false, message: "工程の入力内容を確認してください。" };
  const r = await savePhases(actor, projectId, parsed.data);
  if (!r.ok) return fail(r);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true, message: "工程と予算を保存しました。" };
}

export async function addExpenseAction(
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  const actor = await getActor();
  if (isErr(actor)) return fail(actor);
  const id = uuid.safeParse(fd.get("projectId"));
  if (!id.success) return { ok: false, message: "対象が見つかりません。" };
  const parsed = expenseInputSchema.safeParse({
    date: fd.get("date"),
    kind: fd.get("kind"),
    amount: fd.get("amount"),
    description: fd.get("description"),
  });
  if (!parsed.success)
    return {
      ok: false,
      message: "入力内容を確認してください。",
      fields: fieldErrors(parsed.error),
    };
  const r = await addExpense(actor, id.data, parsed.data);
  if (!r.ok) return fail(r);
  revalidatePath(`/projects/${id.data}`);
  return { ok: true, message: "追加しました。" };
}

export async function deleteExpenseAction(
  expenseId: string,
): Promise<FormState> {
  const actor = await getActor();
  if (isErr(actor)) return fail(actor);
  if (!uuid.safeParse(expenseId).success)
    return { ok: false, message: "対象が見つかりません。" };
  const r = await deleteExpense(actor, expenseId);
  if (!r.ok) return fail(r);
  revalidatePath("/projects", "layout");
  return { ok: true, message: "削除しました。" };
}
