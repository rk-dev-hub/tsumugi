import { TsumugiLogo } from "@/components/tsumugi/mark";
import { NotFoundView } from "@/components/not-found-view";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center">
      <TsumugiLogo className="text-lg" />
      <NotFoundView />
    </main>
  );
}
