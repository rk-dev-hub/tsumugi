import { cn } from "@/lib/utils";

/**
 * 実績・予測・上限を 1 本で見せるゲージ。
 * 実績は塗り、予測は斜線、上限は縦線。値は同じ単位（分・日など）で渡す。
 */
export function MetricGauge({
  label,
  actual,
  forecast,
  limit,
  format,
  tone = "auto",
  className,
}: {
  label: string;
  actual: number;
  forecast?: number | null;
  limit: number;
  format: (v: number) => string;
  /** auto: 上限に対する割合で色を変える */
  tone?: "auto" | "primary";
  className?: string;
}) {
  // tone="primary"（残日数など、上限を超えることのない値）は上限を右端にする
  const max =
    tone === "primary"
      ? Math.max(limit, actual, 1)
      : Math.max(limit * 1.15, actual, forecast ?? 0, 1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const ratio = Math.max(actual, forecast ?? 0) / Math.max(limit, 1);
  const color =
    tone === "primary"
      ? "bg-primary"
      : ratio >= 1
        ? "bg-destructive"
        : ratio >= 0.8
          ? "bg-warning"
          : "bg-primary";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular">
          <span className="text-foreground text-sm font-semibold">
            {format(actual)}
          </span>
          {forecast != null ? (
            <span className="text-muted-foreground">
              {" "}
              → 予測 {format(forecast)}
            </span>
          ) : null}
          <span className="text-muted-foreground"> / {format(limit)}</span>
        </span>
      </div>
      <div
        className="bg-surface-2 relative h-2 overflow-hidden rounded-full"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={actual}
        aria-valuetext={`${format(actual)}（上限 ${format(limit)}）`}
      >
        {forecast != null && forecast > actual ? (
          <div
            className={cn("absolute inset-y-0 left-0 opacity-35", color)}
            style={{
              width: pct(forecast),
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent 0 3px, rgb(255 255 255 / .55) 3px 6px)",
            }}
          />
        ) : null}
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", color)}
          style={{ width: pct(actual) }}
        />
        {tone === "primary" ? null : (
          <div
            className="bg-foreground/70 absolute inset-y-[-2px] w-0.5"
            style={{ left: pct(limit) }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
