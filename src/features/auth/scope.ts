import { prisma } from "@/lib/prisma";
import type { SessionUser } from "./rbac";

/**
 * 見てよい範囲。他人の工数・プロジェクトの予実・原価を読むときは必ずここを通す。
 * - ADMIN: 全員・全プロジェクト・原価
 * - MANAGER: 部下（自分が承認者）と自分、PM のプロジェクト。原価は canViewCost かつ PM のプロジェクト
 * - MEMBER: 自分、参加プロジェクト（工数の合計のみ）
 */

export async function visibleUserIds(
  actor: SessionUser,
): Promise<string[] | "ALL"> {
  if (actor.role === "ADMIN") return "ALL";
  if (actor.role === "MEMBER") return [actor.id];
  const subs = await prisma.user.findMany({
    where: { approverId: actor.id },
    select: { id: true },
  });
  return [actor.id, ...subs.map((s) => s.id)];
}

export type ProjectAccess = {
  canView: boolean;
  /** 予実（工程ごとの予算・実績・着地見込み）を見られる */
  canViewBudget: boolean;
  /** 編集できる（ADMIN か PM） */
  canEdit: boolean;
  /** 単価・労務費・原価・粗利を見られる */
  canViewCost: boolean;
  /** 売上額・PM を変えられる */
  canEditRevenue: boolean;
};

const NONE: ProjectAccess = {
  canView: false,
  canViewBudget: false,
  canEdit: false,
  canViewCost: false,
  canEditRevenue: false,
};

export async function projectAccess(
  actor: SessionUser,
  projectId: string,
): Promise<ProjectAccess> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      pmId: true,
      kind: true,
      members: { where: { userId: actor.id }, select: { userId: true } },
    },
  });
  if (!p) return NONE;
  if (actor.role === "ADMIN") {
    return {
      canView: true,
      canViewBudget: true,
      canEdit: true,
      canViewCost: true,
      canEditRevenue: true,
    };
  }
  const isPm = p.pmId === actor.id;
  if (actor.role === "MANAGER" && isPm) {
    const u = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { canViewCost: true },
    });
    return {
      canView: true,
      canViewBudget: true,
      canEdit: true,
      canViewCost: Boolean(u?.canViewCost),
      canEditRevenue: false,
    };
  }
  const isMember = p.members.length > 0 || p.kind === "INTERNAL";
  if (isMember) return { ...NONE, canView: true };
  return NONE;
}

/** 一覧に出すプロジェクトの絞り込み条件 */
export function projectListWhere(actor: SessionUser) {
  if (actor.role === "ADMIN") return {};
  if (actor.role === "MANAGER") {
    return {
      OR: [
        { pmId: actor.id },
        { members: { some: { userId: actor.id } } },
        { kind: "INTERNAL" as const },
      ],
    };
  }
  return {
    OR: [
      { members: { some: { userId: actor.id } } },
      { kind: "INTERNAL" as const },
    ],
  };
}

export async function canViewUser(
  actor: SessionUser,
  userId: string,
): Promise<boolean> {
  const ids = await visibleUserIds(actor);
  return ids === "ALL" || ids.includes(userId);
}
