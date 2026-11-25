import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-wide discovery">
      <div className="empty-state">
        <h1>We couldn’t find that page</h1>
        <p>Browse the catalog to see the spaces in this demo.</p>
        <Link className={buttonVariants({})} href="/workspaces">Explore spaces</Link>
      </div>
    </div>
  );
}
