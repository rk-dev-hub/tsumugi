"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/toast";
import { decideAction } from "../actions";

export function DecisionPanel({
  periodId,
  status,
  closed,
}: {
  periodId: string;
  status: string;
  closed: boolean;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const run = (op: "APPROVE" | "REJECT" | "CANCEL_APPROVAL") =>
    start(async () => {
      setError(null);
      const r = await decideAction({ periodId, op, comment });
      if (!r.ok) return setError(r.message ?? "処理できませんでした。");
      toast(r.message ?? "");
      if (op !== "CANCEL_APPROVAL") router.push("/approvals");
    });

  if (closed) {
    return (
      <Card>
        <CardContent className="text-muted-foreground pt-5 text-sm">
          この月は締め済みのため、操作できません。
        </CardContent>
      </Card>
    );
  }
  if (status !== "SUBMITTED" && status !== "APPROVED") return null;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>{status === "SUBMITTED" ? "判断" : "承認の取消"}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <p
            className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          コメント
          {status === "SUBMITTED" ? "（差し戻すときは必須）" : "（必須）"}
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </label>
        {status === "SUBMITTED" ? (
          <div className="flex gap-2">
            <Button
              variant="grad"
              disabled={pending}
              onClick={() => run("APPROVE")}
              className="flex-1"
            >
              <Check aria-hidden />
              承認する
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run("REJECT")}
            >
              <RotateCcw aria-hidden />
              差し戻す
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run("CANCEL_APPROVAL")}
          >
            <Undo2 aria-hidden />
            承認を取り消す
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
