/**
 * 体験用データ（架空の制作会社「アオバ制作」）。 pnpm db:seed
 *
 * - 部署 3・メンバー 18 名・顧客 5 社・プロジェクト 17 件（業務 14・社内 3）
 * - 直近 6 か月の工数・勤務時間。古い月は承認・締め済み、最近の週は提出・承認待ち・差戻しが混在
 * - 予算は「順調」「注意」「超過」のプロジェクトが揃うように設定
 *
 * データが入っている DB では何もしない。入れ直すときは pnpm db:seed --reset（全データを消去）。
 * 人物・企業はすべて架空。
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { createPrismaClient } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { addDaysStr, eachDateStr } from "@/lib/date-range";
import { isWorkday } from "@/lib/holidays";
import { d, todayJst } from "@/features/common/dates";
import {
  addMonths,
  firstDayOfMonth,
  lastDayOfMonth,
  periodOf,
} from "@/features/timesheet/domain/period";
import { computeLaborCosts, type Rate } from "@/features/costing/domain/labor";

const prisma = createPrismaClient();
const DEMO_PASSWORD = "TsumugiDemo#2026";

// ------------------------------------------------------------------
// 乱数（毎回同じデータになるよう固定シード）
// ------------------------------------------------------------------
let seed = 20261125;
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
function weighted<T>(xs: readonly { v: T; w: number }[]): T {
  const total = xs.reduce((s, x) => s + x.w, 0);
  let r = rand() * total;
  for (const x of xs) {
    r -= x.w;
    if (r <= 0) return x.v;
  }
  return xs[xs.length - 1].v;
}

// ------------------------------------------------------------------
// マスタ
// ------------------------------------------------------------------
const DEPARTMENTS = [
  { code: "DESIGN", name: "デザイン部" },
  { code: "DEV", name: "開発部" },
  { code: "ADMIN", name: "管理部" },
] as const;

const CLIENTS = [
  { code: "HOKUTO", name: "北斗食品株式会社" },
  { code: "MINATO", name: "みなと物流株式会社" },
  { code: "ICHIBAN", name: "一番星書房" },
  { code: "SOLARIS", name: "ソラリス電機株式会社" },
  { code: "SAKURAZAKA", name: "桜坂市" },
] as const;

const CATEGORIES = [
  { code: "MTG", name: "打ち合わせ" },
  { code: "DESIGN", name: "設計・デザイン" },
  { code: "BUILD", name: "制作・実装" },
  { code: "REVIEW", name: "レビュー・テスト" },
  { code: "DOC", name: "資料作成" },
  { code: "SUPPORT", name: "運用・サポート" },
] as const;
type Cat = (typeof CATEGORIES)[number]["code"];

type Dept = (typeof DEPARTMENTS)[number]["code"];
type PersonDef = {
  key: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  dept: Dept;
  approver?: string;
  rate: number;
  /** 単価改定（適用開始の月オフセット, 新単価） */
  raise?: [number, number];
  canViewCost?: boolean;
  disabled?: boolean;
};

const PEOPLE: PersonDef[] = [
  {
    key: "admin",
    name: "森川 遥",
    email: "admin@example.com",
    role: "ADMIN",
    dept: "ADMIN",
    rate: 6000,
  },
  {
    key: "manager",
    name: "小野寺 航",
    email: "manager@example.com",
    role: "MANAGER",
    dept: "DEV",
    approver: "admin",
    rate: 6500,
    canViewCost: true,
  },
  {
    key: "manager2",
    name: "高瀬 理沙",
    email: "manager2@example.com",
    role: "MANAGER",
    dept: "DESIGN",
    approver: "admin",
    rate: 6200,
    canViewCost: true,
  },
  {
    key: "member",
    name: "佐倉 ひなた",
    email: "member@example.com",
    role: "MEMBER",
    dept: "DEV",
    approver: "manager",
    rate: 4200,
    raise: [-2, 4500],
  },
  {
    key: "d1",
    name: "相原 蓮",
    email: "aihara@example.com",
    role: "MEMBER",
    dept: "DEV",
    approver: "manager",
    rate: 5200,
  },
  {
    key: "d2",
    name: "井上 誠",
    email: "inoue@example.com",
    role: "MEMBER",
    dept: "DEV",
    approver: "manager",
    rate: 4800,
  },
  {
    key: "d3",
    name: "大槻 美咲",
    email: "otsuki@example.com",
    role: "MEMBER",
    dept: "DEV",
    approver: "manager",
    rate: 4600,
  },
  {
    key: "d4",
    name: "川端 悠真",
    email: "kawabata@example.com",
    role: "MEMBER",
    dept: "DEV",
    approver: "manager",
    rate: 3800,
  },
  {
    key: "d5",
    name: "久保田 翼",
    email: "kubota@example.com",
    role: "MEMBER",
    dept: "DEV",
    approver: "manager",
    rate: 5600,
  },
  {
    key: "d6",
    name: "坂本 千尋",
    email: "sakamoto@example.com",
    role: "MEMBER",
    dept: "DEV",
    approver: "manager",
    rate: 4400,
  },
  {
    key: "g1",
    name: "白石 葵",
    email: "shiraishi@example.com",
    role: "MEMBER",
    dept: "DESIGN",
    approver: "manager2",
    rate: 4800,
  },
  {
    key: "g2",
    name: "田村 奏",
    email: "tamura@example.com",
    role: "MEMBER",
    dept: "DESIGN",
    approver: "manager2",
    rate: 4300,
    raise: [-3, 4600],
  },
  {
    key: "g3",
    name: "中西 陽菜",
    email: "nakanishi@example.com",
    role: "MEMBER",
    dept: "DESIGN",
    approver: "manager2",
    rate: 3900,
  },
  {
    key: "g4",
    name: "野口 颯太",
    email: "noguchi@example.com",
    role: "MEMBER",
    dept: "DESIGN",
    approver: "manager2",
    rate: 4100,
  },
  {
    key: "g5",
    name: "林 紗季",
    email: "hayashi@example.com",
    role: "MEMBER",
    dept: "DESIGN",
    approver: "manager2",
    rate: 5000,
  },
  {
    key: "g6",
    name: "藤田 大和",
    email: "fujita@example.com",
    role: "MEMBER",
    dept: "DESIGN",
    approver: "manager2",
    rate: 3700,
  },
  {
    key: "a1",
    name: "松岡 栞",
    email: "matsuoka@example.com",
    role: "MEMBER",
    dept: "ADMIN",
    approver: "admin",
    rate: 3600,
  },
  {
    key: "x1",
    name: "村上 慎也",
    email: "murakami@example.com",
    role: "MEMBER",
    dept: "DEV",
    approver: "manager",
    rate: 4700,
    disabled: true,
  },
];

/**
 * プロジェクト。start / end は今月からの月オフセット。
 * health: 予算の状態（ok / caution / over）。予算は工数の生成後に実績から決める。
 */
type ProjectDef = {
  code: string;
  name: string;
  kind: "WORK" | "INTERNAL";
  client?: (typeof CLIENTS)[number]["code"];
  pm?: string;
  start: number;
  end: number | null;
  status: "ACTIVE" | "COMPLETED" | "PROSPECT";
  revenue?: number;
  color: number;
  phases: { name: string; cat: Cat[] }[];
  members: string[];
  /** 担当メンバーの時間の重み */
  weight: number;
  health: "ok" | "caution" | "over" | "done";
  /** 実績に対する進み具合（予算 = 実績 ÷ progress） */
  progress?: number;
};

const P_WEB = [
  { name: "要件定義", cat: ["MTG", "DOC"] as Cat[] },
  { name: "設計", cat: ["DESIGN", "DOC", "MTG"] as Cat[] },
  { name: "開発", cat: ["BUILD", "REVIEW"] as Cat[] },
  { name: "テスト", cat: ["REVIEW", "BUILD"] as Cat[] },
  { name: "リリース準備", cat: ["DOC", "SUPPORT", "MTG"] as Cat[] },
];
const P_DESIGN = [
  { name: "ヒアリング", cat: ["MTG", "DOC"] as Cat[] },
  { name: "デザイン", cat: ["DESIGN", "REVIEW"] as Cat[] },
  { name: "制作", cat: ["BUILD", "DESIGN"] as Cat[] },
  { name: "校正・納品", cat: ["REVIEW", "DOC"] as Cat[] },
];

const PROJECTS: ProjectDef[] = [
  {
    code: "HKT-EC",
    name: "北斗食品 EC サイト刷新",
    kind: "WORK",
    client: "HOKUTO",
    pm: "manager",
    start: -5,
    end: 1,
    status: "ACTIVE",
    revenue: 18_000_000,
    color: 0,
    phases: P_WEB,
    members: ["manager", "member", "d1", "d2", "d5", "g1", "g5", "x1"],
    weight: 5,
    health: "over",
    progress: 0.97,
  },
  {
    code: "MNT-APP",
    name: "みなと物流 配車管理アプリ",
    kind: "WORK",
    client: "MINATO",
    pm: "manager",
    start: -4,
    end: 2,
    status: "ACTIVE",
    revenue: 24_000_000,
    color: 1,
    phases: P_WEB,
    members: ["manager", "d1", "d3", "d4", "d6", "member"],
    weight: 5,
    health: "caution",
    progress: 0.86,
  },
  {
    code: "SLR-IOT",
    name: "ソラリス電機 IoT ダッシュボード",
    kind: "WORK",
    client: "SOLARIS",
    pm: "manager",
    start: -2,
    end: 4,
    status: "ACTIVE",
    revenue: 15_500_000,
    color: 2,
    phases: P_WEB,
    members: ["manager", "d2", "d5", "d6", "g4"],
    weight: 4,
    health: "ok",
    progress: 0.45,
  },
  {
    code: "SKZ-PORTAL",
    name: "桜坂市 子育て情報ポータル",
    kind: "WORK",
    client: "SAKURAZAKA",
    pm: "manager2",
    start: -3,
    end: 1,
    status: "ACTIVE",
    revenue: 9_800_000,
    color: 3,
    phases: P_WEB,
    members: ["manager2", "g1", "g3", "g6", "d4", "member"],
    weight: 4,
    health: "caution",
    progress: 0.82,
  },
  {
    code: "ICB-BRAND",
    name: "一番星書房 ブランドサイト",
    kind: "WORK",
    client: "ICHIBAN",
    pm: "manager2",
    start: -2,
    end: 1,
    status: "ACTIVE",
    revenue: 5_200_000,
    color: 4,
    phases: P_DESIGN,
    members: ["manager2", "g2", "g5", "g6"],
    weight: 4,
    health: "over",
    progress: 1.02,
  },
  {
    code: "HKT-PKG",
    name: "北斗食品 新商品パッケージ",
    kind: "WORK",
    client: "HOKUTO",
    pm: "manager2",
    start: -1,
    end: 2,
    status: "ACTIVE",
    revenue: 3_600_000,
    color: 5,
    phases: P_DESIGN,
    members: ["manager2", "g2", "g3", "g4"],
    weight: 3,
    health: "ok",
    progress: 0.4,
  },
  {
    code: "SLR-CAT",
    name: "ソラリス電機 製品カタログ 2027",
    kind: "WORK",
    client: "SOLARIS",
    pm: "manager2",
    start: -3,
    end: 0,
    status: "ACTIVE",
    revenue: 4_400_000,
    color: 6,
    phases: P_DESIGN,
    members: ["manager2", "g1", "g4", "g5"],
    weight: 3,
    health: "ok",
    progress: 0.78,
  },
  {
    code: "MNT-HR",
    name: "みなと物流 採用サイト",
    kind: "WORK",
    client: "MINATO",
    pm: "manager2",
    start: -1,
    end: 1,
    status: "ACTIVE",
    revenue: 2_800_000,
    color: 7,
    phases: P_DESIGN,
    members: ["manager2", "g3", "g6", "d6"],
    weight: 2,
    health: "ok",
    progress: 0.55,
  },
  {
    code: "ICB-APP",
    name: "一番星書房 読書記録アプリ",
    kind: "WORK",
    client: "ICHIBAN",
    pm: "manager",
    start: 0,
    end: 4,
    status: "ACTIVE",
    revenue: 12_000_000,
    color: 8,
    phases: P_WEB,
    members: ["manager", "d3", "d5", "g2"],
    weight: 2,
    health: "ok",
    progress: 0.12,
  },
  {
    code: "SKZ-MAINT",
    name: "桜坂市 公式サイト保守",
    kind: "WORK",
    client: "SAKURAZAKA",
    pm: "manager",
    start: -5,
    end: null,
    status: "ACTIVE",
    revenue: 6_000_000,
    color: 9,
    phases: [
      { name: "保守対応", cat: ["SUPPORT", "BUILD"] },
      { name: "定例・報告", cat: ["MTG", "DOC"] },
    ],
    members: ["manager", "d4", "d6", "member", "g6"],
    weight: 1,
    health: "ok",
    progress: 0.5,
  },
  {
    code: "SLR-SPEC",
    name: "ソラリス電機 次期基幹システム調査",
    kind: "WORK",
    client: "SOLARIS",
    pm: "manager",
    start: 0,
    end: 2,
    status: "PROSPECT",
    color: 10,
    phases: [{ name: "調査", cat: ["MTG", "DOC"] }],
    members: ["manager", "d1"],
    weight: 1,
    health: "ok",
    progress: 0.3,
  },
  {
    code: "HKT-LP",
    name: "北斗食品 キャンペーン LP",
    kind: "WORK",
    client: "HOKUTO",
    pm: "manager2",
    start: -5,
    end: -4,
    status: "COMPLETED",
    revenue: 1_800_000,
    color: 11,
    phases: P_DESIGN,
    members: ["manager2", "g1", "g2", "g3"],
    weight: 4,
    health: "done",
  },
  {
    code: "MNT-ANLY",
    name: "みなと物流 配送データ分析",
    kind: "WORK",
    client: "MINATO",
    pm: "manager",
    start: -5,
    end: -3,
    status: "COMPLETED",
    revenue: 4_800_000,
    color: 3,
    phases: P_WEB.slice(0, 4),
    members: ["manager", "d2", "d3", "x1"],
    weight: 4,
    health: "done",
  },
  {
    code: "ICB-EVENT",
    name: "一番星書房 ブックフェア告知",
    kind: "WORK",
    client: "ICHIBAN",
    pm: "manager2",
    start: -4,
    end: -3,
    status: "COMPLETED",
    revenue: 1_200_000,
    color: 7,
    phases: P_DESIGN,
    members: ["manager2", "g4", "g5", "g6"],
    weight: 3,
    health: "done",
  },
  {
    code: "IN-MTG",
    name: "社内会議",
    kind: "INTERNAL",
    start: -6,
    end: null,
    status: "ACTIVE",
    color: 9,
    phases: [{ name: "全体", cat: ["MTG"] }],
    members: [],
    weight: 0.6,
    health: "ok",
  },
  {
    code: "IN-STUDY",
    name: "教育・研修",
    kind: "INTERNAL",
    start: -6,
    end: null,
    status: "ACTIVE",
    color: 10,
    phases: [{ name: "全体", cat: ["DOC", "REVIEW"] }],
    members: [],
    weight: 0.4,
    health: "ok",
  },
  {
    code: "IN-SALES",
    name: "提案・営業支援",
    kind: "INTERNAL",
    start: -6,
    end: null,
    status: "ACTIVE",
    color: 5,
    phases: [{ name: "全体", cat: ["DOC", "MTG"] }],
    members: [],
    weight: 0.3,
    health: "ok",
  },
];

const NOTES: Record<Cat, string[]> = {
  MTG: [
    "定例ミーティング",
    "先方と仕様のすり合わせ",
    "社内レビュー会",
    "進捗確認",
    "キックオフ",
  ],
  DESIGN: [
    "画面設計",
    "ワイヤーフレーム修正",
    "トップページのデザイン案",
    "DB 設計",
    "API 設計の見直し",
  ],
  BUILD: [
    "一覧画面の実装",
    "管理画面のコーディング",
    "検索機能の実装",
    "レスポンシブ対応",
    "入力フォームの実装",
    "バナー制作",
  ],
  REVIEW: [
    "コードレビュー",
    "結合テスト",
    "表示崩れの確認",
    "指摘の修正",
    "校正",
  ],
  DOC: ["提案資料の作成", "議事録の整理", "仕様書の更新", "手順書の作成"],
  SUPPORT: [
    "問い合わせ対応",
    "更新作業",
    "障害の一次調査",
    "アクセス解析レポート",
  ],
};

// ------------------------------------------------------------------

async function resetAll() {
  // TRUNCATE は行トリガー（追記のみの制約）を発火しない
  await prisma.$executeRawUnsafe(`
    TRUNCATE "AiUsageLog", "AiCache", "AuditLog", "ApprovalEvent", "TimesheetPeriod", "MonthlyLaborCost", "ClosingMonth",
      "RunningTimer", "Attendance", "TimeEntry", "Expense", "ProjectMember", "Phase", "Project", "Client", "WorkCategory",
      "CostRate", "RecoveryCode", "User", "Department", "Holiday", "Company" CASCADE`);
}

async function main() {
  const { values } = parseArgs({
    options: { reset: { type: "boolean", default: false } },
  });
  if ((await prisma.user.count()) > 0) {
    if (!values.reset) {
      console.log(
        "データが入っているため、体験用データは投入しません（入れ直すときは --reset）。",
      );
      return;
    }
    if (process.env.NODE_ENV === "production") {
      console.error("本番環境では --reset を使えません。");
      process.exit(1);
    }
    await resetAll();
  }

  const today = todayJst();
  const thisMonth = today.slice(0, 7);
  const from = firstDayOfMonth(addMonths(thisMonth, -5));
  const ym = (off: number) => addMonths(thisMonth, off);

  // 会社・休日
  await prisma.company.create({
    data: {
      id: 1,
      name: "アオバ制作",
      timeStepMinutes: 15,
      gapThresholdMinutes: 15,
      submissionGraceDays: 3,
      requireTotpForManagers: false,
    },
  });
  const companyHolidays: { date: string; name: string }[] = [];
  for (const y of new Set([
    Number(from.slice(0, 4)),
    Number(today.slice(0, 4)),
    Number(today.slice(0, 4)) + 1,
  ])) {
    for (const md of ["08-13", "08-14", "08-15"])
      companyHolidays.push({ date: `${y}-${md}`, name: "夏季休暇" });
    for (const md of ["12-29", "12-30", "12-31"])
      companyHolidays.push({ date: `${y}-${md}`, name: "年末年始休暇" });
    for (const md of ["01-02", "01-03"])
      companyHolidays.push({ date: `${y}-${md}`, name: "年末年始休暇" });
  }
  await prisma.holiday.createMany({
    data: companyHolidays.map((h) => ({ date: d(h.date), name: h.name })),
    skipDuplicates: true,
  });
  const holidaySet = new Set(companyHolidays.map((h) => h.date));

  // マスタ
  const depts = new Map<string, string>();
  for (const x of DEPARTMENTS)
    depts.set(x.code, (await prisma.department.create({ data: x })).id);
  const clients = new Map<string, string>();
  for (const x of CLIENTS)
    clients.set(x.code, (await prisma.client.create({ data: x })).id);
  const cats = new Map<string, string>();
  for (const [i, x] of CATEGORIES.entries())
    cats.set(
      x.code,
      (await prisma.workCategory.create({ data: { ...x, sortOrder: i } })).id,
    );

  // メンバー（承認者を先に作るため 2 回に分ける）
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = new Map<string, string>();
  for (const p of PEOPLE) {
    const u = await prisma.user.create({
      data: {
        email: p.email,
        name: p.name,
        passwordHash,
        role: p.role,
        status: p.disabled ? "DISABLED" : "ACTIVE",
        departmentId: depts.get(p.dept)!,
        canViewCost: Boolean(p.canViewCost),
      },
    });
    users.set(p.key, u.id);
  }
  const rates = new Map<string, Rate[]>();
  for (const p of PEOPLE) {
    if (p.approver)
      await prisma.user.update({
        where: { id: users.get(p.key)! },
        data: { approverId: users.get(p.approver)! },
      });
    const list: Rate[] = [
      { effectiveFrom: addDaysStr(from, -365), hourlyRate: p.rate },
    ];
    if (p.raise)
      list.push({
        effectiveFrom: firstDayOfMonth(ym(p.raise[0])),
        hourlyRate: p.raise[1],
      });
    rates.set(users.get(p.key)!, list);
    await prisma.costRate.createMany({
      data: list.map((r) => ({
        userId: users.get(p.key)!,
        effectiveFrom: d(r.effectiveFrom),
        hourlyRate: r.hourlyRate,
      })),
    });
  }

  // プロジェクト
  type P = ProjectDef & {
    id: string;
    startDate: string;
    endDate: string | null;
    phaseIds: string[];
  };
  const projects: P[] = [];
  for (const def of PROJECTS) {
    const startDate =
      def.start <= -6 ? addDaysStr(from, -30) : firstDayOfMonth(ym(def.start));
    const endDate = def.end === null ? null : lastDayOfMonth(ym(def.end));
    const p = await prisma.project.create({
      data: {
        code: def.code,
        name: def.name,
        kind: def.kind,
        status: def.status,
        clientId: def.client ? clients.get(def.client)! : null,
        pmId: def.pm ? users.get(def.pm)! : null,
        startDate: d(startDate),
        endDate: endDate ? d(endDate) : null,
        revenueAmount: def.revenue ?? null,
        colorIndex: def.color,
      },
    });
    const phaseIds: string[] = [];
    for (const [i, ph] of def.phases.entries()) {
      phaseIds.push(
        (
          await prisma.phase.create({
            data: { projectId: p.id, name: ph.name, sortOrder: i },
          })
        ).id,
      );
    }
    if (def.members.length > 0) {
      await prisma.projectMember.createMany({
        data: def.members.map((k) => ({
          projectId: p.id,
          userId: users.get(k)!,
        })),
      });
    }
    projects.push({ ...def, id: p.id, startDate, endDate, phaseIds });
  }

  // ------------------------------------------------------------------
  // 工数と勤務時間
  // ------------------------------------------------------------------
  type Entry = {
    userId: string;
    projectId: string;
    phaseId: string;
    workCategoryId: string;
    date: string;
    startMinute: number;
    endMinute: number;
    minutes: number;
    note: string;
  };
  const entries: Entry[] = [];
  const attendances: {
    userId: string;
    date: string;
    startMinute: number;
    endMinute: number;
    breakMinutes: number;
    gapReason: string;
  }[] = [];
  const days = eachDateStr(from, today).filter((x) => isWorkday(x, holidaySet));
  const nowMinute = Math.min(
    17 * 60,
    Math.max(9 * 60, new Date(Date.now() + 9 * 3600_000).getUTCHours() * 60),
  );

  const workers = PEOPLE.filter((p) => p.key !== "admin");
  // デモ用: member は直近の 2 日を入力漏れにする
  const recent = days.filter((x) => x < today).slice(-6);
  for (const person of workers) {
    const userId = users.get(person.key)!;
    for (const day of days) {
      // 退職者は 3 か月前の月末まで
      if (person.disabled && day > lastDayOfMonth(ym(-3))) continue;
      // 有給などで休む日
      if (rand() < 0.05) continue;
      if (person.key === "member" && (day === recent[1] || day === recent[3]))
        continue;

      const candidates = projects.filter(
        (p) =>
          p.startDate <= day &&
          (p.endDate === null || p.endDate >= day) &&
          (p.kind === "INTERNAL" || p.members.includes(person.key)),
      );
      if (candidates.length === 0) continue;

      const start = pick([540, 540, 540, 555, 570, 600]);
      const lunch = 720;
      const end = Math.min(
        start + 540 + pick([0, 0, 0, 15, 30, 45, 60, -30]),
        1170,
      );
      const isToday = day === today;
      const limit = isToday ? Math.min(nowMinute, 720) : end;
      let cursor = start;
      const blocks: [number, number][] = [];
      while (cursor < limit) {
        if (cursor === lunch) {
          cursor = lunch + 60;
          continue;
        }
        const max = (cursor < lunch ? lunch : limit) - cursor;
        if (max <= 0) break;
        const len = Math.min(max, pick([30, 60, 60, 90, 120, 120, 150, 180]));
        blocks.push([cursor, cursor + len]);
        cursor += len;
        if (cursor < lunch && rand() < 0.08)
          cursor = Math.min(lunch, cursor + 15); // 少し空く
      }
      if (blocks.length === 0) continue;
      // 朝会は社内会議
      for (const [s, e] of blocks) {
        const internalMtg = s === start && rand() < 0.25;
        const proj = internalMtg
          ? projects.find((p) => p.code === "IN-MTG")!
          : weighted(candidates.map((p) => ({ v: p, w: p.weight })));
        const span =
          Date.parse(proj.endDate ?? addDaysStr(today, 60)) -
            Date.parse(proj.startDate) || 1;
        const progress = Math.min(
          0.999,
          Math.max(0, (Date.parse(day) - Date.parse(proj.startDate)) / span),
        );
        let phaseIdx =
          proj.phases.length === 1
            ? 0
            : Math.floor(progress * proj.phases.length);
        if (proj.phases.length > 1 && rand() < 0.2)
          phaseIdx = Math.max(0, phaseIdx - 1);
        if (proj.code === "SKZ-MAINT") phaseIdx = rand() < 0.7 ? 0 : 1;
        const phase = proj.phases[phaseIdx];
        const cat = pick(phase.cat);
        entries.push({
          userId,
          projectId: proj.id,
          phaseId: proj.phaseIds[phaseIdx],
          workCategoryId: cats.get(cat)!,
          date: day,
          startMinute: s,
          endMinute: e,
          minutes: e - s,
          note: rand() < 0.75 ? pick(NOTES[cat]) : "",
        });
      }
      if (!isToday) {
        const worked = blocks.reduce((s, [a, b]) => s + b - a, 0);
        const gap = end - start - 60 - worked;
        attendances.push({
          userId,
          date: day,
          startMinute: start,
          endMinute: end,
          breakMinutes: 60,
          gapReason:
            gap > 15
              ? pick(["移動時間", "社内の雑務", "打ち合わせの待ち時間"])
              : "",
        });
      }
    }
  }

  // 一括登録
  for (let i = 0; i < entries.length; i += 2000) {
    await prisma.timeEntry.createMany({
      data: entries.slice(i, i + 2000).map((e) => ({ ...e, date: d(e.date) })),
    });
  }
  for (let i = 0; i < attendances.length; i += 2000) {
    await prisma.attendance.createMany({
      data: attendances
        .slice(i, i + 2000)
        .map((a) => ({ ...a, date: d(a.date) })),
    });
  }

  // ------------------------------------------------------------------
  // 予算（実績から逆算して、順調・注意・超過が揃うようにする）
  // ------------------------------------------------------------------
  const actualByPhase = new Map<string, number>();
  for (const e of entries)
    actualByPhase.set(
      e.phaseId,
      (actualByPhase.get(e.phaseId) ?? 0) + e.minutes,
    );
  const round15h = (m: number) => Math.max(60, Math.round(m / 60 / 4) * 4 * 60); // 4 時間単位
  for (const p of projects) {
    if (p.kind === "INTERNAL") continue;
    const actuals = p.phaseIds.map((id) => actualByPhase.get(id) ?? 0);
    const total = actuals.reduce((s, x) => s + x, 0);
    const progress = p.progress ?? 1;
    // 全体予算 = 実績 ÷ 進み具合。工程ごとに、着手済みの工程は実績の比率、未着手は残りを按分
    const totalBudget =
      p.health === "done"
        ? Math.round(total * 1.08)
        : Math.round(total / progress);
    const started = actuals.filter((x) => x > 0).length;
    const remainingPhases = p.phases.length - started;
    for (const [i, id] of p.phaseIds.entries()) {
      const a = actuals[i];
      let budget: number;
      let remaining: number | null = null;
      if (p.health === "done") {
        budget = round15h(a * 1.08);
        remaining = 0;
      } else if (a > 0) {
        const done = i < started - 1;
        // 超過のプロジェクトは、直近の 2 工程だけが予算を超えている
        const overHere = p.health === "over" && i >= started - 2;
        budget = round15h(
          done
            ? a * (overHere ? 0.82 : 1.04)
            : overHere
              ? a * 0.9
              : a / Math.min(0.95, progress + 0.25),
        );
        remaining = done
          ? 0
          : overHere
            ? Math.round((a * 0.25) / 60) * 60
            : null;
      } else {
        budget = round15h(
          Math.max(totalBudget - total, total * 0.08) /
            Math.max(1, remainingPhases),
        );
      }
      await prisma.phase.update({
        where: { id },
        data: { budgetMinutes: budget, remainingMinutes: remaining },
      });
    }
  }

  // 経費・外注費
  const expenseDefs: [
    string,
    "OUTSOURCING" | "EXPENSE",
    number,
    string,
    number,
  ][] = [
    [
      "HKT-EC",
      "OUTSOURCING",
      1_650_000,
      "決済まわりの実装（外部パートナー）",
      -2,
    ],
    ["HKT-EC", "EXPENSE", 48_000, "撮影スタジオ利用料", -3],
    ["MNT-APP", "OUTSOURCING", 2_200_000, "ネイティブアプリ開発の一部委託", -1],
    ["ICB-BRAND", "OUTSOURCING", 680_000, "イラスト制作", -1],
    ["ICB-BRAND", "EXPENSE", 35_000, "フォントライセンス", -2],
    ["SLR-CAT", "OUTSOURCING", 420_000, "製品撮影", -2],
    ["HKT-LP", "EXPENSE", 22_000, "素材写真", -5],
    ["SKZ-PORTAL", "EXPENSE", 18_000, "アクセシビリティ検証ツール", -1],
  ];
  const adminId = users.get("admin")!;
  for (const [code, kind, amount, description, off] of expenseDefs) {
    const p = projects.find((x) => x.code === code)!;
    await prisma.expense.create({
      data: {
        projectId: p.id,
        kind,
        amount,
        description,
        date: d(`${ym(off)}-10`),
        createdById: adminId,
      },
    });
  }

  // ------------------------------------------------------------------
  // 提出・承認
  // ------------------------------------------------------------------
  const approverOf = new Map(
    PEOPLE.map((p) => [
      users.get(p.key)!,
      p.approver ? users.get(p.approver)! : null,
    ]),
  );
  const periodTotals = new Map<
    string,
    { userId: string; start: string; end: string; minutes: number }
  >();
  for (const e of entries) {
    const pr = periodOf(e.date);
    const k = `${e.userId}|${pr.start}`;
    const cur = periodTotals.get(k) ?? { userId: e.userId, ...pr, minutes: 0 };
    cur.minutes += e.minutes;
    periodTotals.set(k, cur);
  }
  const lastMonth = ym(-1);
  const currentWeekPeriod = periodOf(today);
  const at = (date: string, hm: string) => new Date(`${date}T${hm}:00+09:00`);
  let rejectedForMember = false;
  for (const p of periodTotals.values()) {
    const approver = approverOf.get(p.userId) ?? null;
    if (!approver) continue;
    if (p.start >= currentWeekPeriod.start) continue; // 今週は未提出
    const month = p.start.slice(0, 7);
    const isMember = p.userId === users.get("member");
    let status: "APPROVED" | "SUBMITTED" | "REJECTED" | "NONE";
    if (month < lastMonth) status = "APPROVED";
    else if (month === lastMonth)
      status = rand() < 0.88 ? "APPROVED" : "SUBMITTED";
    else {
      const r = rand();
      status = r < 0.45 ? "APPROVED" : r < 0.85 ? "SUBMITTED" : "NONE";
      // 直近の週は未提出の人が多い
      if (addDaysStr(p.end, 7) >= today && rand() < 0.5) status = "NONE";
      if (isMember && !rejectedForMember) {
        status = "REJECTED";
        rejectedForMember = true;
      }
    }
    if (isMember && month === thisMonth && addDaysStr(p.end, 7) >= today)
      status = "NONE";
    if (status === "NONE") continue;
    const submittedAt = at(
      addDaysStr(p.end, 1) > today ? today : addDaysStr(p.end, 1),
      "10:00",
    );
    const decidedAt = at(
      addDaysStr(p.end, 2) > today ? today : addDaysStr(p.end, 2),
      "15:30",
    );
    const comment =
      status === "REJECTED"
        ? "水曜の 15 時以降が北斗 EC になっていますが、みなと物流の定例ではありませんか？確認して再提出してください。"
        : "";
    const period = await prisma.timesheetPeriod.create({
      data: {
        userId: p.userId,
        startDate: d(p.start),
        endDate: d(p.end),
        status,
        totalMinutes: p.minutes,
        submittedAt,
        decidedAt: status === "SUBMITTED" ? null : decidedAt,
        deciderId: status === "SUBMITTED" ? null : approver,
        comment,
      },
    });
    await prisma.approvalEvent.create({
      data: {
        periodId: period.id,
        type: "SUBMIT",
        actorId: p.userId,
        at: submittedAt,
      },
    });
    if (status !== "SUBMITTED") {
      await prisma.approvalEvent.create({
        data: {
          periodId: period.id,
          type: status === "APPROVED" ? "APPROVE" : "REJECT",
          actorId: approver,
          comment,
          at: decidedAt,
        },
      });
    }
  }

  // ------------------------------------------------------------------
  // 締め（3 か月以上前の月）と確定人件費
  // ------------------------------------------------------------------
  for (const off of [-5, -4, -3, -2]) {
    const m = ym(off);
    const rows = computeLaborCosts(
      entries.filter((e) => e.date.startsWith(m)),
      rates,
    );
    if (rows.length > 0)
      await prisma.monthlyLaborCost.createMany({ data: rows });
    const closedAt = at(`${ym(off + 1)}-0${off === -2 ? 5 : 4}`, "17:00");
    await prisma.closingMonth.create({
      data: { yearMonth: m, closed: true, closedAt, closedById: adminId },
    });
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "MONTH_CLOSE",
        targetType: "ClosingMonth",
        targetId: m,
        at: closedAt,
        detail: {
          rows: rows.length,
          laborCost: rows.reduce((s, r) => s + r.laborCost, 0),
        },
      },
    });
  }

  console.log(
    `体験用データを投入しました: メンバー ${PEOPLE.length} 名、プロジェクト ${projects.length} 件、工数 ${entries.length.toLocaleString()} 件、勤務 ${attendances.length.toLocaleString()} 日`,
  );
  console.log(
    `ログイン: admin@example.com / manager@example.com / member@example.com（パスワード ${DEMO_PASSWORD}）`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
