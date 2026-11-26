import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { err, ok, type Result } from "@/lib/result";
import type { SessionUser } from "@/features/auth/rbac";
import { d } from "@/features/common/dates";

export type MasterKind = "department" | "client" | "category";

export const masterInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "コードを入力してください")
    .max(30)
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "コードは英数字・ハイフン・アンダースコアで入力してください",
    ),
  name: z.string().trim().min(1, "名前を入力してください").max(100),
  active: z.coerce.boolean().default(true),
});

function canEdit(actor: SessionUser, kind: MasterKind): boolean {
  // 顧客はマネージャーも登録できる
  return (
    actor.role === "ADMIN" || (kind === "client" && actor.role === "MANAGER")
  );
}

export async function saveMaster(
  actor: SessionUser,
  kind: MasterKind,
  id: string | null,
  input: z.infer<typeof masterInputSchema>,
): Promise<Result<void>> {
  if (!canEdit(actor, kind)) return err("FORBIDDEN");
  if (id && kind === "client" && actor.role !== "ADMIN")
    return err("FORBIDDEN");
  const label = { department: "部署", client: "顧客", category: "業務分類" }[
    kind
  ];
  try {
    await prisma.$transaction(async (tx) => {
      if (kind === "department") {
        if (id) await tx.department.update({ where: { id }, data: input });
        else await tx.department.create({ data: input });
      } else if (kind === "client") {
        if (id) await tx.client.update({ where: { id }, data: input });
        else await tx.client.create({ data: input });
      } else {
        const sortOrder = id
          ? undefined
          : ((await tx.workCategory.aggregate({ _max: { sortOrder: true } }))
              ._max.sortOrder ?? 0) + 1;
        if (id) await tx.workCategory.update({ where: { id }, data: input });
        else
          await tx.workCategory.create({
            data: { ...input, sortOrder: sortOrder! },
          });
      }
      await recordAudit(tx, {
        actorId: actor.id,
        action: "MASTER_CHANGE",
        targetType: label,
        targetId: id,
        detail: { ...input, op: id ? "update" : "create" },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return err("VALIDATION", "このコードはすでに使われています。", {
        code: "すでに使われています",
      });
    }
    if (e instanceof Error && e.message.includes("No record"))
      return err("NOT_FOUND");
    throw e;
  }
  return ok(undefined);
}

export async function listMasters() {
  const [departments, clients, categories] = await Promise.all([
    prisma.department.findMany({ orderBy: { code: "asc" } }),
    prisma.client.findMany({ orderBy: { code: "asc" } }),
    prisma.workCategory.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return { departments, clients, categories };
}

export const holidayInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を入力してください"),
  name: z.string().trim().min(1, "名前を入力してください").max(50),
});

export async function addHoliday(
  actor: SessionUser,
  input: z.infer<typeof holidayInputSchema>,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  await prisma.$transaction(async (tx) => {
    await tx.holiday.upsert({
      where: { date: d(input.date) },
      create: { date: d(input.date), name: input.name },
      update: { name: input.name },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "MASTER_CHANGE",
      targetType: "休日",
      targetId: input.date,
      detail: input,
    });
  });
  return ok(undefined);
}

export async function deleteHoliday(
  actor: SessionUser,
  date: string,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  await prisma.$transaction(async (tx) => {
    await tx.holiday.deleteMany({ where: { date: d(date) } });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "MASTER_CHANGE",
      targetType: "休日",
      targetId: date,
      detail: { op: "delete" },
    });
  });
  return ok(undefined);
}

export const companyInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  timeStepMinutes: z.coerce
    .number()
    .int()
    .refine(
      (v) => [5, 10, 15, 30].includes(v),
      "5・10・15・30 分から選んでください",
    ),
  gapThresholdMinutes: z.coerce.number().int().min(0).max(120),
  submissionGraceDays: z.coerce.number().int().min(0).max(14),
  requireTotpForManagers: z.coerce.boolean().default(false),
});

export async function saveCompany(
  actor: SessionUser,
  input: z.infer<typeof companyInputSchema>,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  await prisma.$transaction(async (tx) => {
    const before = await tx.company.findUnique({ where: { id: 1 } });
    await tx.company.upsert({
      where: { id: 1 },
      create: { id: 1, ...input },
      update: input,
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "COMPANY_CHANGE",
      targetType: "Company",
      targetId: "1",
      detail: {
        before: before ? { ...before, updatedAt: undefined } : null,
        after: input,
      },
    });
  });
  return ok(undefined);
}
