"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function DiscoveryFilterPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <aside aria-label="Workspace filters" className="filter-sidebar">
      <Button
        variant="outline"
        className="filter-toggle"
        aria-controls="workspace-filter-controls"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal size={17} aria-hidden="true" />
        {open ? "Hide filters" : "Show filters"}
      </Button>
      <div id="workspace-filter-controls" data-open={open} onSubmit={() => setOpen(false)}>
        {children}
      </div>
    </aside>
  );
}
