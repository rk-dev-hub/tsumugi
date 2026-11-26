import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { err, type Err } from "@/lib/result";
import type { Role, UserStatus } from "@/generated/prisma/client";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
};

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || u.status !== "ACTIVE") return null;
  return {
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
  };
}

/** ログイン必須（画面用。未ログインなら /login へ） */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "MEMBER") redirect("/");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

// ---- Server Action 用（redirect ではなく Err を返す） ----

export async function getActor(): Promise<SessionUser | Err> {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return err("UNAUTHENTICATED");
  return user;
}

export async function getManagerActor(): Promise<SessionUser | Err> {
  const a = await getActor();
  if (isErr(a)) return a;
  if (a.role === "MEMBER") return err("FORBIDDEN");
  return a;
}

export async function getAdminActor(): Promise<SessionUser | Err> {
  const a = await getActor();
  if (isErr(a)) return a;
  if (a.role !== "ADMIN") return err("FORBIDDEN");
  return a;
}

export function isErr(v: SessionUser | Err): v is Err {
  return "ok" in v && v.ok === false;
}
