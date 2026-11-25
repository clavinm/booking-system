import { getUpcomingSlots } from "@/repositories/seats";
import { bookingDateSchema, workspaceSlugSchema } from "@/validations/booking";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: RouteContext<"/api/workspaces/[id]/slots">) {
  const id = workspaceSlugSchema.safeParse((await params).id);
  const dates = new URL(request.url).searchParams.getAll("date");
  const date = bookingDateSchema.safeParse(dates.length === 1 ? dates[0] : undefined);
  if (!id.success || !date.success) {
    return Response.json({
      ok: false,
      error: { code: "INVALID_SLOT_QUERY", message: "Provide a workspace ID and a date in YYYY-MM-DD format." },
    }, { status: 400, headers });
  }

  const slots = await getUpcomingSlots(id.data, date.data);
  if (!slots) {
    return Response.json({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "The workspace could not be found." },
    }, { status: 404, headers });
  }

  return Response.json({ ok: true, data: { workspaceId: id.data, date: date.data, slots } }, { headers });
}
