import { describe, expect, it, vi } from "vitest";
import { GET as getWorkspace } from "@/app/api/workspaces/[id]/route";
import { GET as listWorkspaces } from "@/app/api/workspaces/route";

vi.mock("server-only", () => ({}));

function fetchCatalog(query = "") {
  return listWorkspaces(new Request(`http://localhost/api/workspaces${query}`));
}

describe.runIf(process.env.SEATSYNC_INTEGRATION === "1")("PostgreSQL workspace catalog", () => {
  it("combines search, city, category, price and multiple amenities", async () => {
    const response = await fetchCatalog("?q=KADRI&city=Mangaluru&category=library&min=70&max=90&amenity=wifi&amenity=quiet");
    const { data } = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.workspaces[0].id).toBe("the-reading-room");
  });

  it("filters seat count and sorts in both price directions", async () => {
    const ascending = await (await fetchCatalog("?available=1&sort=price-asc")).json();
    const descending = await (await fetchCatalog("?available=1&sort=price-desc")).json();

    expect(ascending.data.total).toBe(7);
    expect(ascending.data.workspaces[0].id).toBe("the-focus-cabin");
    expect(descending.data.workspaces[0].id).toBe("copperline-offices");
  });

  it("orders ratings with a stable tie-break and paginates", async () => {
    const first = await (await fetchCatalog("?sort=rating")).json();
    const second = await (await fetchCatalog("?sort=rating&page=2")).json();
    const ids = [...first.data.workspaces, ...second.data.workspaces].map((workspace) => workspace.id);

    expect(first.data.workspaces[0].id).toBe("copperline-offices");
    expect(second.data).toMatchObject({ total: 8, page: 2, totalPages: 2 });
    expect(new Set(ids).size).toBe(8);
  });

  it("returns an empty result for a valid query with no matches", async () => {
    const response = await fetchCatalog("?q=unknown-space");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { total: 0, workspaces: [] } });
  });

  it("treats SQL pattern characters as literal search input", async () => {
    const response = await fetchCatalog("?q=%25");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { total: 0, workspaces: [] } });
  });

  it("returns workspace details and reports unknown identifiers", async () => {
    const request = new Request("http://localhost/api/workspaces/the-reading-room");
    const found = await getWorkspace(request, { params: Promise.resolve({ id: "the-reading-room" }) });
    const missing = await getWorkspace(request, { params: Promise.resolve({ id: "unknown-space" }) });

    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ ok: true, data: { name: "The Reading Room" } });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false, error: { code: "WORKSPACE_NOT_FOUND" } });
  });
});

describe("workspace query validation", () => {
  it.each(["?min=100&max=50", "?city=Unknown", "?page=0", "?amenity=wifi&amenity=pool", "?q=one&q=two"])(
    "returns a consistent 400 for invalid input %s",
    async (query) => {
      const response = await fetchCatalog(query);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_QUERY" } });
    },
  );
});
