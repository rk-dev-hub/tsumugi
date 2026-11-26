export const STATUS_LABEL = {
  PROSPECT: "見込み",
  ACTIVE: "進行中",
  COMPLETED: "完了",
  CANCELED: "中止",
} as const;
export const STATUS_VARIANT = {
  PROSPECT: "info",
  ACTIVE: "success",
  COMPLETED: "default",
  CANCELED: "outline",
} as const;
export const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
