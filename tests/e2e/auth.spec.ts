import { expect, test } from "@playwright/test";
import { login, PASSWORD } from "./helpers";

test("パスワードが違うとログインできない", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill("member@example.com");
  await page.locator("input[name=password]").fill("wrong-password-123");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("未ログインで画面を開くとログインへ戻る", async ({ page }) => {
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/login/);
});

test("メンバーは管理画面を開けない", async ({ page }) => {
  await login(page, "member@example.com");
  await expect(
    page.getByRole("heading", { name: /佐倉 ひなたさん/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "月次締め" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("管理者が追加したメンバーは、初回ログインでパスワードを変える", async ({
  page,
  browser,
}) => {
  await login(page, "admin@example.com");
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "メンバーを追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("氏名").fill("新井 結衣");
  await dialog.getByLabel("メールアドレス").fill("arai@example.com");
  await dialog
    .getByRole("button", { name: "登録して初期パスワードを発行" })
    .click();
  const temp = (await dialog.locator("code").innerText()).trim();
  expect(temp).toMatch(/^Tg-/);

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, "arai@example.com", temp);
  await expect(p2).toHaveURL(/\/first-password/);
  await p2.getByLabel("現在のパスワード").fill(temp);
  await p2
    .getByLabel("新しいパスワード", { exact: true })
    .fill(`${PASSWORD}-new`);
  await p2.getByLabel("新しいパスワード（確認）").fill(`${PASSWORD}-new`);
  await p2.getByRole("button", { name: "設定して続ける" }).click();
  await expect(p2).toHaveURL(/\/login/);
  await login(p2, "arai@example.com", `${PASSWORD}-new`);
  await expect(
    p2.getByRole("heading", { name: /新井 結衣さん/ }),
  ).toBeVisible();
  await ctx.close();
});
