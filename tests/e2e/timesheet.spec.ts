import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, "member@example.com");
});

test("ホームから入力漏れの日を開き、ひとことで記録する", async ({ page }) => {
  await page.getByRole("link", { name: "11/17(火)" }).click();
  await expect(page).toHaveURL(/day=2026-11-17/);

  const composer = page.getByRole("region", { name: "Tsumugi のひとこと入力" });
  await composer
    .getByLabel("今日やったこと")
    .fill("9時半から定例、お昼までデザイン修正、午後はコーディング");
  await composer.getByRole("button", { name: "下書きを作る" }).click();

  await expect(composer.getByText("11/17(火) の下書き")).toBeVisible();
  await expect(composer.getByText("対象を確認してください")).toBeVisible();

  // 対象が決まっていない行があると登録できない
  await composer.getByRole("button", { name: "まとめて登録" }).click();
  await expect(composer.getByRole("alert")).toContainText(
    "3 行目のプロジェクトを選んでください",
  );

  await composer
    .getByLabel("プロジェクト")
    .nth(2)
    .selectOption({ label: "教育・研修" });
  await composer.getByRole("button", { name: "まとめて登録" }).click();
  await expect(page.getByText("3 件の工数を登録しました。")).toBeVisible();
  await expect(composer.getByText("の下書き")).toHaveCount(0);
});

test("聞き返されたら、選択肢で答えられる", async ({ page }) => {
  await page.goto("/timesheet?day=2026-11-19");
  const composer = page.getByRole("region", { name: "Tsumugi のひとこと入力" });
  await composer.getByLabel("今日やったこと").fill("定例のあと実装？");
  await composer.getByRole("button", { name: "下書きを作る" }).click();
  await expect(composer.getByText("どの日の作業ですか？")).toBeVisible();
  await expect(composer.getByRole("button", { name: "今日" })).toBeVisible();
});

test("差し戻された期間を確認できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("差戻し").first()).toBeVisible();
});
