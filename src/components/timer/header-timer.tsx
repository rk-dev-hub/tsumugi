"use client";

import { useEffect, useState, useTransition } from "react";
import { Square } from "lucide-react";
import { stopTimerAction } from "@/features/timesheet/actions";
import { useToast } from "@/components/toast";
import { projectColor } from "@/components/project-color";

function elapsed(fromIso: string, now: number): string {
  const sec = Math.max(
    0,
    Math.floor((now - new Date(fromIso).getTime()) / 1000),
  );
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** ヘッダーに常に出す、動いているタイマー */
export function HeaderTimer({
  timer,
}: {
  timer: {
    startedAt: string;
    projectName: string;
    phaseName: string;
    colorIndex: number;
  } | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);
  if (!timer) return null;
  const c = projectColor(timer.colorIndex);
  return (
    <div
      className="bg-surface flex min-w-0 items-center gap-2 rounded-full border py-1 pr-1 pl-3 text-sm shadow-sm"
      role="status"
      aria-label="動いているタイマー"
    >
      <span className="relative flex size-2.5 shrink-0">
        <span
          className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
          style={{ background: c.solid }}
        />
        <span
          className="relative inline-flex size-2.5 rounded-full"
          style={{ background: c.solid }}
        />
      </span>
      <span className="hidden max-w-40 truncate sm:inline">
        {timer.projectName}
        <span className="text-muted-foreground"> / {timer.phaseName}</span>
      </span>
      <span className="tabular font-medium">
        {elapsed(timer.startedAt, now)}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await stopTimerAction();
            toast(
              r.message ?? (r.ok ? "停止しました" : "停止できませんでした"),
              r.ok ? "success" : "error",
            );
          })
        }
        className="bg-grad grid size-7 place-items-center rounded-full text-white"
        aria-label="タイマーを止めて記録する"
      >
        <Square className="size-3 fill-current" aria-hidden />
      </button>
    </div>
  );
}
