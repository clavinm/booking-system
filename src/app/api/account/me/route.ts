import { getCurrentUser } from "@/services/current-user";

export async function GET() {
  const user = await getCurrentUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) {
    return Response.json({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "Sign in to view your account." },
    }, { status: 401, headers });
  }

  return Response.json({ ok: true, data: user }, { headers });
}
