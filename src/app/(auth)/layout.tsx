import { TsumugiLogo, TsumugiMark } from "@/components/tsumugi/mark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(28rem,36rem)]">
      <section className="bg-grad relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* 糸のモチーフ */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full opacity-30"
          viewBox="0 0 800 800"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 14 }, (_, i) => (
            <path
              key={i}
              d={`M -50 ${120 + i * 45} C 250 ${40 + i * 52}, 450 ${260 + i * 30}, 850 ${150 + i * 48}`}
              fill="none"
              stroke="white"
              strokeWidth={i % 4 === 0 ? 1.4 : 0.7}
              opacity={0.25 + (i % 5) * 0.12}
            />
          ))}
        </svg>
        <div
          className="absolute -top-32 -right-32 size-96 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-fuchsia-300/20 blur-3xl"
          aria-hidden
        />

        <TsumugiLogo className="relative text-lg" light />
        <div className="relative max-w-md">
          <p className="text-4xl leading-tight font-semibold tracking-tight">
            一言から、
            <br />
            一日の工数を紡ぐ。
          </p>
          <p className="mt-5 text-sm leading-relaxed text-white/80">
            「午前は定例、午後は実装」と書くだけで、Tsumugi
            が工数の下書きを作ります。
            予算の見通しや承認の確認も、わかりやすい言葉で手伝います。
          </p>
        </div>
        <div className="relative flex gap-2 text-xs text-white/70">
          <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">
            タイムライン入力
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">
            予実・原価
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">
            AI アシスタント
          </span>
        </div>
      </section>
      <main className="bg-grad-soft flex flex-col items-center justify-center px-4 py-12 sm:px-8 lg:bg-none">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
            <TsumugiLogo className="text-xl" />
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <TsumugiMark className="size-3.5" />
              一言から工数を紡ぐ、工数・予実管理
            </p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
