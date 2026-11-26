/**
 * 例外に頼らないエラー伝播。usecase / Server Action の戻り値に使う。
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "PERIOD_LOCKED"
  | "MONTH_CLOSED"
  | "NOT_FOUND"
  | "SELF_APPROVAL"
  | "OVERLAP"
  | "RATE_LIMITED";

export type AppError = {
  code: AppErrorCode;
  message: string;
  fields?: Record<string, string>;
};

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: AppError };
export type Result<T = void> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "ログインが必要です。",
  FORBIDDEN: "この操作を行う権限がありません。",
  VALIDATION: "入力内容を確認してください。",
  CONFLICT: "現在の状態ではこの操作を実行できません。画面を更新してください。",
  PERIOD_LOCKED: "提出済み・承認済みの期間は編集できません。",
  MONTH_CLOSED: "締め済みの月は変更できません。",
  NOT_FOUND: "対象が見つかりません。",
  SELF_APPROVAL: "自分の工数は承認できません。",
  OVERLAP: "ほかの工数と時間帯が重なっています。",
  RATE_LIMITED: "しばらく時間をおいてから、もう一度お試しください。",
};

export function err(
  code: AppErrorCode,
  message?: string,
  fields?: Record<string, string>,
): Err {
  return {
    ok: false,
    error: { code, message: message ?? DEFAULT_MESSAGES[code], fields },
  };
}

/** 互換用（err と同じ） */
export const errWithDefault = err;
