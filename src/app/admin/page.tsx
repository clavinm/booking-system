import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { bookingQuery } from "@/validations/dashboard";
import { getCurrentUser } from "@/services/current-user";

export const metadata = { title: "Admin dashboard", robots: { index: false, follow: false } };

async function AdminContent({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  const [user, query] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) redirect("/account");
  if (user.role !== "ADMIN") return (
    <section className="account-card">
      <h1>Access denied</h1><p>This page requires an administrator account.</p>
      <Link className={buttonVariants({ variant: "outline" })} href="/account">My bookings</Link>
    </section>
  );

  return <AdminDashboard
    workspaceId={typeof query.workspace === "string" ? query.workspace : undefined}
    panel={typeof query.panel === "string" ? query.panel : undefined}
    error={typeof query.error === "string" ? query.error.slice(0, 180) : undefined}
    saved={query.saved === "1"}
    page={bookingQuery.shape.page.safeParse(query.page).data ?? 1}
  />;
}

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <div className="container-wide discovery">
      <Suspense fallback={<Skeleton className="account-card account-skeleton" role="status"><span className="sr-only">Loading dashboard</span></Skeleton>}>
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
