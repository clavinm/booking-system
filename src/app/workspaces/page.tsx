import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { DiscoveryFilterPanel } from "@/components/workspaces/discovery-filter-panel";
import { DiscoveryFilters } from "@/components/workspaces/discovery-filters";
import { RetrySearch } from "@/components/workspaces/retry-search";
import { WorkspaceCard } from "@/components/workspaces/workspace-card";
import { listWorkspaces } from "@/repositories/workspaces";
import { ReservationError } from "@/services/reservation-error";
import { parseWorkspaceQuery, type WorkspaceQuery } from "@/validations/workspace-query";

export const metadata: Metadata = { title: "Explore workspaces" };

function pageHref(query: WorkspaceQuery, page: number) {
  return {
    pathname: "/workspaces",
    query: { ...query, page },
  };
}

export default async function WorkspacesPage({ searchParams }: PageProps<"/workspaces">) {
  const parsed = parseWorkspaceQuery(await searchParams);
  const query = parsed.success ? parsed.data : undefined;
  const results = query && await listWorkspaces(query).catch((error: unknown) => {
    if (error instanceof ReservationError && error.code === "RESERVATION_BUSY") return null;
    throw error;
  });

  return (
    <div className="container-wide discovery">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span aria-current="page">Explore spaces</span></nav>
      <div className="section-heading discovery-heading">
        <div><h1>Explore workspaces</h1><p>Compare desks, libraries and study centres across three cities.</p></div>
      </div>
      <div className="discovery-layout">
        <DiscoveryFilterPanel>
          <DiscoveryFilters key={JSON.stringify(query)} query={query} />
        </DiscoveryFilterPanel>
        <section aria-labelledby="results-title">
          <div className="results-heading">
            <h2 id="results-title">{results ? `${results.total} ${results.total === 1 ? "workspace" : "workspaces"}` : "Workspace results"}</h2>
            <span>Demo catalog</span>
          </div>
          {results && results.total > 0 ? (
            <>
              <div className="workspace-grid discovery-grid">
                {results.workspaces.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} />)}
              </div>
              {query && results.totalPages > 1 && (
                <nav className="pagination" aria-label="Result pages">
                  {results.page > 1 && <Link href={pageHref(query, results.page - 1)} className={buttonVariants({ variant: "outline", size: "small" })}>Previous</Link>}
                  <span>Page {results.page} of {results.totalPages}</span>
                  {results.page < results.totalPages && <Link href={pageHref(query, results.page + 1)} className={buttonVariants({ variant: "outline", size: "small" })}>Next</Link>}
                </nav>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span className="tile-icon"><SearchX size={25} aria-hidden="true" /></span>
              <h3>{results === null ? "Workspace search is busy" : parsed.success ? "No spaces match your filters" : "Check your filters"}</h3>
              <p>{results === null ? "Try loading your results again in a moment." : parsed.success ? "Try another city, price range or search term." : parsed.error.issues.find((issue) => issue.path[0] === "max" && issue.code === "custom")?.message ?? "One or more search options are invalid. Update the filters to try again."}</p>
              {results === null
                ? <RetrySearch />
                : <Link href="/workspaces" className={buttonVariants({ variant: "outline" })}>Reset filters</Link>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
