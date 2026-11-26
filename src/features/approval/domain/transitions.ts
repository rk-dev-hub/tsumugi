/** 提出・承認の状態遷移 */

export type PeriodStatus =
  "NONE" | "SUBMITTED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
export type Transition =
  "SUBMIT" | "WITHDRAW" | "APPROVE" | "REJECT" | "CANCEL_APPROVAL";

const TABLE: Record<
  Transition,
  { from: PeriodStatus[]; to: Exclude<PeriodStatus, "NONE"> }
> = {
  SUBMIT: { from: ["NONE", "REJECTED", "WITHDRAWN"], to: "SUBMITTED" },
  WITHDRAW: { from: ["SUBMITTED"], to: "WITHDRAWN" },
  APPROVE: { from: ["SUBMITTED"], to: "APPROVED" },
  REJECT: { from: ["SUBMITTED"], to: "REJECTED" },
  CANCEL_APPROVAL: { from: ["APPROVED"], to: "SUBMITTED" },
};

export function nextStatus(
  current: PeriodStatus,
  t: Transition,
): Exclude<PeriodStatus, "NONE"> | null {
  const rule = TABLE[t];
  return rule.from.includes(current) ? rule.to : null;
}

/** 本人が編集できる状態か */
export function isEditableStatus(s: PeriodStatus): boolean {
  return s === "NONE" || s === "REJECTED" || s === "WITHDRAWN";
}

export type ApproverCheckInput = {
  actor: { id: string; role: "ADMIN" | "MANAGER" | "MEMBER" };
  owner: { id: string; approverId: string | null };
  /** owner の承認者が有効な MANAGER / ADMIN か */
  approverIsValid: boolean;
};

export type ApproverCheck = "OK" | "SELF" | "NOT_APPROVER";

/** 承認できる人: 本人以外で、その人の（有効な）承認者か ADMIN */
export function canDecide(i: ApproverCheckInput): ApproverCheck {
  if (i.actor.id === i.owner.id) return "SELF";
  if (i.actor.role === "ADMIN") return "OK";
  if (
    i.actor.role === "MANAGER" &&
    i.approverIsValid &&
    i.owner.approverId === i.actor.id
  )
    return "OK";
  return "NOT_APPROVER";
}
