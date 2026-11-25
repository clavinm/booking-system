import { getWorkspace } from "@/repositories/workspaces";

export async function GET(_request: Request, { params }: RouteContext<"/api/workspaces/[id]">) {
  const workspace = await getWorkspace((await params).id);
  if (!workspace) {
    return Response.json({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "The workspace could not be found." },
    }, { status: 404 });
  }

  return Response.json({ ok: true, data: workspace });
}
