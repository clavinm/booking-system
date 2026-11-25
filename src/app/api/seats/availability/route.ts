import { getSeatAvailability } from "@/repositories/seats";
import { parseAvailabilityQuery } from "@/validations/booking";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const query = parseAvailabilityQuery(new URL(request.url).searchParams);
  if (!query.success) {
    return Response.json({
      ok: false,
      error: { code: "INVALID_AVAILABILITY_QUERY", message: "Provide a workspace ID and a valid time-slot ID." },
    }, { status: 400, headers });
  }

  const { workspaceId, slotId } = query.data;
  const availability = await getSeatAvailability(workspaceId, slotId);
  if (!availability) {
    return Response.json({
      ok: false,
      error: { code: "SLOT_NOT_FOUND", message: "That time slot does not belong to the requested workspace." },
    }, { status: 404, headers });
  }

  return Response.json({ ok: true, data: availability }, { headers });
}
