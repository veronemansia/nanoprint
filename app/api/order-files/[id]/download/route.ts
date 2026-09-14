import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, phpApiUrl } from "@/lib/php-api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: { message: "Authentification requise." } }, { status: 401 });
  }

  let response: Response;
  try {
    response = await fetch(phpApiUrl(`/order-files/${encodeURIComponent(id)}/download`), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: { message: "API PHP injoignable." } }, { status: 503 });
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    return NextResponse.json(
      { error: { message: payload.error?.message || "Téléchargement impossible." } },
      { status: response.status },
    );
  }

  const headers = new Headers();
  const type = response.headers.get("Content-Type") || "application/octet-stream";
  const disposition = response.headers.get("Content-Disposition");
  const length = response.headers.get("Content-Length");
  headers.set("Content-Type", type);
  headers.set("Cache-Control", "private, no-store");
  if (disposition) headers.set("Content-Disposition", disposition);
  if (length) headers.set("Content-Length", length);
  return new NextResponse(response.body, { status: 200, headers });
}
