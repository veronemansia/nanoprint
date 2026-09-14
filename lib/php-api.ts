import { cookies } from "next/headers";

export const SESSION_COOKIE = "nanoprint_session";

export class PhpApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "error",
  ) {
    super(message);
  }
}

function apiUrl(path: string) {
  const base = (process.env.PHP_API_URL || "http://127.0.0.1:8088").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function phpApiUrl(path: string) {
  return apiUrl(path);
}

export async function phpFetch<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const form = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !form && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const session = token ?? (await cookies()).get(SESSION_COOKIE)?.value;
  if (session) headers.set("Authorization", `Bearer ${session}`);

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new PhpApiError("API PHP injoignable.", 503, "unreachable");
  }

  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new PhpApiError(
      payload.error?.message || "La requête a échoué.",
      response.status,
      payload.error?.code || "error",
    );
  }
  return payload.data as T;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function hasSessionCookie() {
  return Boolean((await cookies()).get(SESSION_COOKIE)?.value);
}
