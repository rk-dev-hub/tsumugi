const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

/** クエリの UUID（形式が違えば null） */
export function uuidParam(v: Param): string | null {
  const s = first(v);
  return s && UUID_RE.test(s) ? s : null;
}

/** クエリの日付 'YYYY-MM-DD'（形式が違えば fallback） */
export function dateParam(v: Param, fallback: string): string {
  const s = first(v);
  return s && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
    ? s
    : fallback;
}

export function stringParam(v: Param): string | undefined {
  return first(v);
}
