import { formatHm } from "@/lib/minutes";
import { cn } from "@/lib/utils";

/** 予算に対する実績と着地見込みのバー */
export function BudgetBar({
  budget,
  actual,
  forecast,
  className,
  showLabels = true,
}: {
  budget: number;
  actual: number;
  forecast: number;
  className?: string;
  showLabels?: boolean;
}) {
  if (budget <= 0) {
    return (
      <p className={cn("text-muted-foreground text-xs", className)}>
        予算未設定 ・ 実績 {formatHm(actual)}
      </p>
    );
  }
  const scale = Math.max(budget, forecast, actual) * 1.05;
  const pct = (v: number) => `${Math.min(100, (v * 100) / scale)}%`;
  const rate = Math.round((actual * 1000) / budget) / 10;
  const over = actual >= budget || forecast > budget;
  const caution = !over && actual * 10 >= budget * 8;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className="bg-surface-2 relative h-2.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`予算 ${formatHm(budget)}、実績 ${formatHm(actual)}、着地見込み ${formatHm(forecast)}`}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full opacity-30"
          style={{
            width: pct(forecast),
            background: over ? "var(--danger)" : "var(--grad-via)",
          }}
        />
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            over ? "bg-destructive" : caution ? "bg-warning" : "bg-grad",
          )}
          style={{ width: pct(actual) }}
        />
        <span
          className="bg-foreground/60 absolute inset-y-[-2px] w-0.5"
          style={{ left: pct(budget) }}
          aria-hidden
        />
      </div>
      {showLabels ? (
        <div className="text-muted-foreground tabular flex justify-between text-[11px]">
          <span>
            実績{" "}
            <span className="text-foreground font-medium">
              {formatHm(actual)}
            </span>
            （{rate}%）
          </span>
          <span>
            見込み {formatHm(forecast)} / 予算 {formatHm(budget)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
