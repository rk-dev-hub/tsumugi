import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("提出された工数を Tsumugi の要約を見て承認する", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/approvals");
  const rows = page.locator("tbody tr");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  await rows.first().getByRole("link").click();
  await expect(
    page.getByText("（テスト）今週の作業の要約です。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/approvals$/);
  await expect(rows).toHaveCount(before - 1);
});

test("差し戻しにはコメントが必要", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/approvals");
  await page.locator("tbody tr").first().getByRole("link").click();
  await page.getByRole("button", { name: "差し戻す" }).click();
  await expect(page.getByText("コメントを入力してください。")).toBeVisible();
});

test("PM はプロジェクトの予実と Tsumugi の見通しを見られる", async ({
  page,
}) => {
  await login(page, "manager@example.com");
  await page.goto("/projects");
  await page.getByRole("link", { name: /北斗食品 EC サイト刷新/ }).click();
  await expect(
    page.getByRole("heading", { name: "北斗食品 EC サイト刷新" }),
  ).toBeVisible();
  await expect(page.getByText("工程別の予実")).toBeVisible();
  await expect(page.getByText("（テスト）予算の見通しです")).toBeVisible();
  await expect(page.getByText("原価と粗利")).toBeVisible();
});

test("メンバーにはプロジェクトの予算・原価が見えない", async ({ page }) => {
  await login(page, "member@example.com");
  await page.goto("/projects");
  await page.getByRole("link", { name: /北斗食品 EC サイト刷新/ }).click();
  await expect(
    page.getByRole("heading", { name: "北斗食品 EC サイト刷新" }),
  ).toBeVisible();
  await expect(page.getByText("工程別の予実")).toHaveCount(0);
  await expect(page.getByText("原価と粗利")).toHaveCount(0);
});
