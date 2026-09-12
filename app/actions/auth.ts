"use server";

import { clearSessionCookie, phpFetch, setSessionCookie } from "@/lib/php-api";
import type { MockUser } from "@/lib/types";

export async function loginAction(email: string, password: string) {
  const result = await phpFetch<{ user: MockUser; token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  await setSessionCookie(result.token);
  return result.user;
}

export async function logoutAction() {
  try {
    await phpFetch("/auth/logout", { method: "POST" });
  } catch {
    /* session already invalid */
  }
  await clearSessionCookie();
}

export async function meAction() {
  return phpFetch<MockUser>("/auth/me");
}

export async function markHybridSessionAction() {
  await setSessionCookie("hybrid-local");
}
