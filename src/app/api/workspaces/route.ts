import { ReservationError } from "@/services/reservation-error";
import { listWorkspaces } from "@/repositories/workspaces";
import { parseWorkspaceQuery } from "@/validations/workspace-query";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const params = Object.fromEntries([...new Set(search.keys())].map((key) => {
    const values = search.getAll(key);
    return [key, values.length === 1 ? values[0] : values];
  }));

  const parsed = parseWorkspaceQuery(params);
  if (!parsed.success) {
    return Response.json({
      ok: false,
      error: { code: "INVALID_QUERY", message: "Check the workspace filters.", issues: parsed.error.issues },
    }, { status: 400 });
  }

  try {
    return Response.json({ ok: true, data: await listWorkspaces(parsed.data) });
  } catch (error) {
    if (!(error instanceof ReservationError) || error.code !== "RESERVATION_BUSY") throw error;
    return Response.json({
      ok: false, error: { code: "CATALOG_BUSY", message: "Workspace search is busy. Try again shortly." },
    }, { status: 503, headers: { "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}
