"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastItem = { id: number; message: string; variant: "success" | "error" };
type ToastFn = (message: string, variant?: ToastItem["variant"]) => void;

const ToastContext = createContext<ToastFn>(() => {});

/** 操作の結果を画面の下に数秒だけ出す。 */
export function useToast(): ToastFn {
  return useContext(ToastContext);
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);
  const toast = useCallback<ToastFn>(
    (message, variant = "success") => {
      const id = ++seq;
      setItems((xs) => [...xs.slice(-2), { id, message, variant }]);
      setTimeout(() => dismiss(id), variant === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className={cn(
              "animate-slide-in bg-foreground text-background pointer-events-auto flex max-w-md items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg",
            )}
          >
            {t.variant === "success" ? (
              <CheckCircle2
                className="size-4 shrink-0 text-[var(--success-soft)]"
                aria-hidden
              />
            ) : (
              <AlertCircle
                className="size-4 shrink-0 text-[var(--danger-soft)]"
                aria-hidden
              />
            )}
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="ml-1 rounded p-0.5 opacity-70 hover:opacity-100"
              aria-label="閉じる"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
