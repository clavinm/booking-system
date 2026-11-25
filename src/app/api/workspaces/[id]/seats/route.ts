import { getSeatLayout } from "@/repositories/seats";
import { workspaceSlugSchema } from "@/validations/booking";

export async function GET(_request: Request, { params }: RouteContext<"/api/workspaces/[id]/seats">) {
  const id = workspaceSlugSchema.safeParse((await params).id);
  if (!id.success) {
    return Response.json({ ok: false, error: { code: "INVALID_WORKSPACE", message: "Enter a valid workspace ID." } }, { status: 400 });
  }

  const layout = await getSeatLayout(id.data);
  if (!layout) {
    return Response.json({ ok: false, error: { code: "WORKSPACE_NOT_FOUND", message: "The workspace could not be found." } }, { status: 404 });
  }

  return Response.json({ ok: true, data: layout });
}
