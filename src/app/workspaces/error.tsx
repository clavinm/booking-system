"use client";

import { Button } from "@/components/ui/button";

export default function WorkspaceError({ retry }: { retry: () => void }) {
  return (
    <div className="container-wide discovery">
      <div className="empty-state">
        <h1>We couldn’t load the catalog</h1>
        <p>Try loading the workspaces again.</p>
        <Button onClick={retry}>Try again</Button>
      </div>
    </div>
  );
}
