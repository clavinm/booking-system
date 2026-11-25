import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="container-wide discovery" role="status">
      <span className="sr-only">Loading workspaces</span>
      <Skeleton className="skeleton-title" />
      <div className="workspace-grid">
        <Skeleton className="skeleton-card" />
        <Skeleton className="skeleton-card" />
        <Skeleton className="skeleton-card" />
      </div>
    </div>
  );
}
