import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("未承認の期間がある月は締められない", async ({ page }) => {
  await login(page, "admin@example.com");
  await page.goto("/admin/closing?ym=2026-10");
  await expect(
    page.getByText(/承認が済んでいない期間が \d+ 件あります/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2026年10月を締める" }),
  ).toBeDisabled();
});

test("締めた月は採算レポートの下書きを作れる", async ({ page }) => {
  await login(page, "admin@example.com");
  await page.goto("/admin/closing?ym=2026-09");
  await expect(page.getByText(/に締めました/)).toBeVisible();
  await page.getByRole("button", { name: "下書きを作る" }).click();
  await expect(page.getByLabel("レポートの下書き")).toHaveValue(
    /（テスト）月次レポート/,
  );
});

test("レポートの CSV を出力すると監査ログに残る", async ({ page }) => {
  await login(page, "admin@example.com");
  await page.goto("/reports");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "集計 CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^tsumugi-project-.*\.csv$/);
  await page.goto("/admin/audit?action=EXPORT");
  await expect(
    page.getByRole("cell", { name: "CSV 出力" }).first(),
  ).toBeVisible();
});
