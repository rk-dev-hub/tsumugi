"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/utils";
import { formatClock, formatHm } from "@/lib/minutes";
import { projectColor } from "@/components/project-color";
import type { EntryView } from "@/features/timesheet/usecase";

export const PX_PER_MIN = 0.8; // 1 時間 = 48px
const DAY_HEIGHT = 1440 * PX_PER_MIN;
const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

export type DraftBlock = {
  key: string;
  date: string;
  startMinute: number;
  endMinute: number;
  colorIndex: number | null;
  label: string;
  warn: boolean;
};

type Drag =
  | { mode: "create"; date: string; anchor: number; current: number }
  | {
      mode: "move";
      id: string;
      offset: number;
      duration: number;
      date: string;
      start: number;
      moved: boolean;
    }
  | { mode: "resize"; id: string; date: string; start: number; end: number };

export function Timeline({
  days,
  entries,
  drafts,
  step,
  today,
  holidays,
  editable,
  attendance,
  onCreate,
  onChange,
  onOpen,
}: {
  days: string[];
  entries: EntryView[];
  drafts: DraftBlock[];
  step: number;
  today: string;
  holidays: Record<string, string>;
  editable: (date: string) => boolean;
  attendance: Record<
    string,
    { startMinute: number; endMinute: number; breakMinutes: number } | null
  >;
  onCreate: (date: string, start: number, end: number) => void;
  onChange: (
    entry: EntryView,
    date: string,
    start: number,
    end: number,
  ) => void;
  onOpen: (entry: EntryView) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);

  // 最初は 8:00 ごろから表示する
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7.5 * 60 * PX_PER_MIN;
  }, []);
  useEffect(() => {
    const tick = () => {
      const jst = new Date(Date.now() + 9 * 3600_000);
      setNowMin(jst.getUTCHours() * 60 + jst.getUTCMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const snap = (m: number) =>
    Math.min(1440, Math.max(0, Math.round(m / step) * step));

  function pointToCell(
    e: PointerEvent,
  ): { date: string; minute: number } | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const colW = rect.width / days.length;
    const idx = Math.min(
      days.length - 1,
      Math.max(0, Math.floor((e.clientX - rect.left) / colW)),
    );
    const minute = (e.clientY - rect.top) / PX_PER_MIN;
    return { date: days[idx], minute };
  }

  function onGridPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const blockEl = target.closest<HTMLElement>("[data-entry-id]");
    const cell = pointToCell(e);
    if (!cell) return;
    if (blockEl) {
      const entry = entries.find((x) => x.id === blockEl.dataset.entryId);
      if (!entry || !editable(entry.date)) return;
      e.preventDefault();
      gridRef.current?.setPointerCapture(e.pointerId);
      if (target.closest("[data-resize]")) {
        setDrag({
          mode: "resize",
          id: entry.id,
          date: entry.date,
          start: entry.startMinute,
          end: entry.endMinute,
        });
      } else {
        setDrag({
          mode: "move",
          id: entry.id,
          offset: cell.minute - entry.startMinute,
          duration: entry.endMinute - entry.startMinute,
          date: entry.date,
          start: entry.startMinute,
          moved: false,
        });
      }
      return;
    }
    if (target.closest("[data-draft]")) return;
    if (!editable(cell.date)) return;
    e.preventDefault();
    gridRef.current?.setPointerCapture(e.pointerId);
    const m = Math.floor(cell.minute / step) * step;
    setDrag({ mode: "create", date: cell.date, anchor: m, current: m + step });
  }

  function onGridPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const cell = pointToCell(e);
    if (!cell) return;
    if (drag.mode === "create") {
      setDrag({ ...drag, current: snap(cell.minute) });
    } else if (drag.mode === "move") {
      const start = Math.min(
        1440 - drag.duration,
        Math.max(0, snap(cell.minute - drag.offset)),
      );
      const date = editable(cell.date) ? cell.date : drag.date;
      if (start !== drag.start || date !== drag.date)
        setDrag({ ...drag, start, date, moved: true });
    } else {
      const end = Math.max(drag.start + step, snap(cell.minute));
      if (end !== drag.end) setDrag({ ...drag, end });
    }
  }

  function onGridPointerUp() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.mode === "create") {
      let s = Math.min(d.anchor, d.current);
      let en = Math.max(d.anchor, d.current);
      // クリックだけなら 1 時間の枠にする
      if (en - s <= step) {
        s = d.anchor;
        en = Math.min(1440, d.anchor + 60);
      }
      onCreate(d.date, s, en);
      return;
    }
    const entry = entries.find((x) => x.id === d.id);
    if (!entry) return;
    if (d.mode === "move") {
      if (!d.moved) return onOpen(entry);
      onChange(entry, d.date, d.start, d.start + d.duration);
    } else if (d.end !== entry.endMinute) {
      onChange(entry, entry.date, entry.startMinute, d.end);
    }
  }

  function onBlockKey(e: KeyboardEvent<HTMLButtonElement>, entry: EntryView) {
    if (!editable(entry.date)) {
      if (e.key === "Enter" || e.key === " ") onOpen(entry);
      return;
    }
    const idx = days.indexOf(entry.date);
    let { startMinute: s, endMinute: en } = entry;
    let date = entry.date;
    switch (e.key) {
      case "ArrowUp":
        if (e.shiftKey) en = Math.max(s + step, en - step);
        else if (s - step >= 0) {
          s -= step;
          en -= step;
        }
        break;
      case "ArrowDown":
        if (e.shiftKey) en = Math.min(1440, en + step);
        else if (en + step <= 1440) {
          s += step;
          en += step;
        }
        break;
      case "ArrowLeft":
        if (idx > 0) date = days[idx - 1];
        break;
      case "ArrowRight":
        if (idx < days.length - 1) date = days[idx + 1];
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onOpen(entry);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (
      s !== entry.startMinute ||
      en !== entry.endMinute ||
      date !== entry.date
    )
      onChange(entry, date, s, en);
  }

  // ドラッグ中の見た目
  const view = entries.map((x) => {
    if (drag?.mode === "move" && drag.id === x.id)
      return {
        ...x,
        date: drag.date,
        startMinute: drag.start,
        endMinute: drag.start + drag.duration,
        dragging: true,
      };
    if (drag?.mode === "resize" && drag.id === x.id)
      return { ...x, endMinute: drag.end, dragging: true };
    return { ...x, dragging: false };
  });

  const cols = `repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="bg-surface overflow-hidden rounded-2xl border shadow-sm">
      {/* 日付の見出し */}
      <div
        className="bg-surface/95 grid border-b pl-12"
        style={{ gridTemplateColumns: cols }}
      >
        {days.map((d) => {
          const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
          const isToday = d === today;
          const hol = holidays[d];
          return (
            <div
              key={d}
              className="flex flex-col items-center gap-0.5 border-l py-2 first:border-l-0"
            >
              <span
                className={cn(
                  "text-[11px]",
                  dow === 0 || hol
                    ? "text-destructive"
                    : dow === 6
                      ? "text-info"
                      : "text-muted-foreground",
                )}
              >
                {WEEKDAY[dow]}
                {hol ? (
                  <span className="ml-1 hidden xl:inline">{hol}</span>
                ) : null}
              </span>
              <span
                className={cn(
                  "tabular grid size-7 place-items-center rounded-full text-sm font-semibold",
                  isToday && "bg-grad text-white shadow-sm",
                )}
              >
                {Number(d.slice(8))}
              </span>
            </div>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="relative max-h-[min(70vh,680px)] overflow-y-auto overscroll-contain"
      >
        <div className="relative flex" style={{ height: DAY_HEIGHT }}>
          {/* 時刻の目盛り */}
          <div className="relative w-12 shrink-0" aria-hidden>
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="text-muted-foreground tabular absolute right-2 -translate-y-1/2 text-[10px]"
                style={{ top: h * 60 * PX_PER_MIN }}
              >
                {h === 0 ? "" : `${h}:00`}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            className="relative grid flex-1 touch-none select-none"
            style={{ gridTemplateColumns: cols }}
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={() => setDrag(null)}
          >
            {/* 時間の罫線 */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-[var(--grid-line)]"
                  style={{ top: h * 60 * PX_PER_MIN }}
                />
              ))}
            </div>

            {days.map((d) => {
              const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
              const off = dow === 0 || dow === 6 || Boolean(holidays[d]);
              const a = attendance[d];
              const canEdit = editable(d);
              return (
                <div
                  key={d}
                  data-date={d}
                  className={cn(
                    "relative border-l first:border-l-0",
                    off && "bg-[var(--weekend)]",
                    canEdit
                      ? "cursor-crosshair"
                      : "cursor-default bg-[repeating-linear-gradient(135deg,transparent_0_8px,var(--grid-line)_8px_9px)]",
                  )}
                >
                  {/* 勤務時間の帯 */}
                  {a ? (
                    <div
                      className="bg-grad pointer-events-none absolute left-0 w-[3px] rounded-r opacity-70"
                      style={{
                        top: a.startMinute * PX_PER_MIN,
                        height:
                          (Math.min(a.endMinute, 1440) - a.startMinute) *
                          PX_PER_MIN,
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {d === today && nowMin !== null ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20"
                      style={{ top: nowMin * PX_PER_MIN }}
                      aria-hidden
                    >
                      <div className="h-[2px] w-full bg-[var(--grad-to)]" />
                      <div className="absolute -top-[3px] -left-[4px] size-2 rounded-full bg-[var(--grad-to)]" />
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* 新規作成中の枠 */}
            {drag?.mode === "create" ? (
              <BlockFrame
                dayIndex={days.indexOf(drag.date)}
                dayCount={days.length}
                start={Math.min(drag.anchor, drag.current)}
                end={Math.max(
                  drag.anchor,
                  drag.current,
                  Math.min(drag.anchor, drag.current) + step,
                )}
                className="border-primary bg-primary-soft/70 z-30 border-2 border-dashed"
              >
                <span className="tabular text-primary-soft-foreground px-1.5 text-[11px] font-medium">
                  {formatClock(Math.min(drag.anchor, drag.current))}–
                  {formatClock(Math.max(drag.anchor, drag.current))}
                </span>
              </BlockFrame>
            ) : null}

            {/* 工数のブロック */}
            {view.map((x) => {
              const c = projectColor(x.colorIndex);
              const h = (x.endMinute - x.startMinute) * PX_PER_MIN;
              const canEdit = editable(x.date);
              return (
                <BlockFrame
                  key={x.id}
                  dayIndex={days.indexOf(x.date)}
                  dayCount={days.length}
                  start={x.startMinute}
                  end={x.endMinute}
                  className={cn(
                    "z-10",
                    x.dragging &&
                      "z-40 opacity-90 shadow-lg ring-2 ring-[var(--ring)]",
                  )}
                >
                  <button
                    type="button"
                    data-entry-id={x.id}
                    onKeyDown={(e) => onBlockKey(e, x)}
                    className={cn(
                      "group relative flex h-full w-full flex-col overflow-hidden rounded-lg border-l-[3px] px-1.5 py-0.5 text-left shadow-sm transition-shadow hover:shadow-md",
                      canEdit
                        ? "cursor-grab active:cursor-grabbing"
                        : "cursor-pointer",
                    )}
                    style={{
                      background: c.gradient,
                      borderLeftColor: c.solid,
                      color: c.ink,
                    }}
                    aria-label={`${x.projectName} ${x.phaseName} ${formatClock(x.startMinute)}〜${formatClock(x.endMinute)}${canEdit ? "。矢印キーで移動、Shift と上下キーで長さ、Enter で編集" : ""}`}
                  >
                    <span className="truncate text-[11px] leading-tight font-semibold">
                      {x.projectName}
                    </span>
                    {h >= 30 ? (
                      <span className="truncate text-[10px] leading-tight opacity-80">
                        {x.phaseName}
                        {x.workCategoryName ? ` · ${x.workCategoryName}` : ""}
                      </span>
                    ) : null}
                    {h >= 44 ? (
                      <span className="tabular mt-auto text-[10px] opacity-75">
                        {formatClock(x.startMinute)}–{formatClock(x.endMinute)}{" "}
                        · {formatHm(x.endMinute - x.startMinute)}
                      </span>
                    ) : null}
                    {canEdit ? (
                      <span
                        data-resize
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                        aria-hidden
                      >
                        <span className="mx-auto mt-0.5 block h-0.5 w-6 rounded-full bg-current opacity-0 group-hover:opacity-40" />
                      </span>
                    ) : null}
                  </button>
                </BlockFrame>
              );
            })}

            {/* Tsumugi の下書き */}
            {drafts.map((x) => {
              const c =
                x.colorIndex !== null ? projectColor(x.colorIndex) : null;
              return (
                <BlockFrame
                  key={x.key}
                  dayIndex={days.indexOf(x.date)}
                  dayCount={days.length}
                  start={x.startMinute}
                  end={x.endMinute}
                  className="z-20"
                >
                  <div
                    data-draft
                    className={cn(
                      "animate-fade-in flex h-full w-full flex-col overflow-hidden rounded-lg border-2 border-dashed px-1.5 py-0.5 backdrop-blur-[1px]",
                      x.warn
                        ? "border-warning"
                        : "border-[var(--tsumugi-mark)]",
                    )}
                    style={{
                      background: c
                        ? `color-mix(in oklch, ${c.soft} 75%, transparent)`
                        : "color-mix(in oklch, var(--tsumugi) 80%, transparent)",
                    }}
                  >
                    <span className="text-tsumugi-foreground truncate text-[11px] font-semibold">
                      {x.label}
                    </span>
                    <span className="tabular text-tsumugi-foreground text-[10px] opacity-80">
                      下書き {formatClock(x.startMinute)}–
                      {formatClock(x.endMinute)}
                    </span>
                  </div>
                </BlockFrame>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockFrame({
  dayIndex,
  dayCount,
  start,
  end,
  className,
  children,
}: {
  dayIndex: number;
  dayCount: number;
  start: number;
  end: number;
  className?: string;
  children: React.ReactNode;
}) {
  if (dayIndex < 0) return null;
  const w = 100 / dayCount;
  return (
    <div
      className={cn("absolute px-[3px]", className)}
      style={{
        left: `${dayIndex * w}%`,
        width: `${w}%`,
        top: start * PX_PER_MIN + 1,
        height: Math.max(14, (end - start) * PX_PER_MIN - 2),
      }}
    >
      {children}
    </div>
  );
}
