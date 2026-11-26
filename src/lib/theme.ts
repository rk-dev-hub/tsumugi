export const THEME_COOKIE = "tsumugi-theme";
export type Theme = "light" | "dark" | "system";

export function parseTheme(v: string | undefined): Theme {
  return v === "light" || v === "dark" ? v : "system";
}
