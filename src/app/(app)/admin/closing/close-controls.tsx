"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { closeMonthAction, reopenMonthAction } from "./actions";

export function CloseControls({
  ym,
  label,
  closed,
  canClose,
}: {
  ym: string;
  label: string;
  closed: boolean;
  canClose: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-5">
        {error ? (
          <p
            className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {closed ? (
          <ConfirmDialog
            title={`${label}の締めを解除しますか？`}
            description="解除すると工数を変更できるようになり、確定した人件費は取り消されます。理由は監査ログに残ります。"
            reasonLabel="解除する理由"
            confirmLabel="締めを解除"
            destructive
            trigger={(open) => (
              <Button variant="outline" onClick={open}>
                <LockOpen aria-hidden />
                締めを解除する
              </Button>
            )}
            onConfirm={async (reason) => {
              const r = await reopenMonthAction(ym, reason);
              if (!r.ok) {
                setError(r.message ?? null);
                return false;
              }
              toast(r.message ?? "");
              router.refresh();
            }}
          />
        ) : (
          <ConfirmDialog
            title={`${label}を締めますか？`}
            description="締めた月の工数・勤務時間・経費は変更できなくなり、人件費がその時点の単価で確定します。"
            confirmLabel="締める"
            trigger={(open) => (
              <Button variant="grad" onClick={open} disabled={!canClose}>
                <Lock aria-hidden />
                {label}を締める
              </Button>
            )}
            onConfirm={async () => {
              const r = await closeMonthAction(ym);
              if (!r.ok) {
                setError(r.message ?? null);
                return false;
              }
              toast(r.message ?? "");
              router.refresh();
            }}
          />
        )}
        <p className="text-muted-foreground text-xs">
          締めと解除は監査ログに記録されます。
        </p>
      </CardContent>
    </Card>
  );
}
