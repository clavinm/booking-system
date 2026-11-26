import { z } from "zod";
import { engineeringLabEnabled } from "@/lib/engineering-env";
import { reservationFailure, reservationJson, withReservationUser } from "@/lib/reservation-http";
import { getCurrentUser } from "@/services/current-user";
import { runEngineeringLab } from "@/services/engineering-lab";
import { labScenarios } from "@/types/engineering";

const labRequest = z.strictObject({ scenario: z.enum(labScenarios) });

export function POST(request: Request) {
  if (!engineeringLabEnabled()) return reservationFailure(404, "NOT_FOUND", "Engineering lab is unavailable.");
  return withReservationUser(request, async () => {
    if ((await getCurrentUser())?.role !== "ADMIN") return reservationFailure(403, "FORBIDDEN", "Administrator access is required.");
    const parsed = labRequest.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) return reservationFailure(400, "INVALID_SCENARIO", "Choose an engineering scenario.");
    return reservationJson(await runEngineeringLab(parsed.data.scenario));
  });
}
