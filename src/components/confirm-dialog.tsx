"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 確認ダイアログ。破壊的な操作（締め・却下・無効化・送信）の前に使う。
 * reasonLabel を渡すと、理由の入力欄が付き、入力するまで確定できない。
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "実行する",
  destructive = false,
  reasonLabel,
  reasonRequired = true,
  onConfirm,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
  onConfirm: (reason: string) => Promise<boolean | void> | boolean | void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (isOpen && !d.open) d.showModal();
    if (!isOpen && d.open) d.close();
  }, [isOpen]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => {
      setIsOpen(false);
      setReason("");
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  const open = () => setIsOpen(true);
  const disabled =
    busy || (!!reasonLabel && reasonRequired && reason.trim() === "");

  return (
    <>
      {trigger(open)}
      <dialog
        ref={ref}
        aria-labelledby={`${id}-title`}
        className="bg-surface text-foreground m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border p-0 shadow-xl backdrop:bg-black/40"
      >
        <form
          method="dialog"
          className="flex flex-col gap-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (disabled) return;
            setBusy(true);
            try {
              const r = await onConfirm(reason.trim());
              if (r !== false) setIsOpen(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 id={`${id}-title`} className="text-base font-semibold">
            {title}
          </h2>
          {description ? (
            <div className="text-muted-foreground text-sm">{description}</div>
          ) : null}
          {reasonLabel ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-reason`}>{reasonLabel}</Label>
              <Textarea
                id={`${id}-reason`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required={reasonRequired}
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              キャンセル
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={disabled}
            >
              {busy ? "処理中…" : confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
