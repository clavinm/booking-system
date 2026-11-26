import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LabPanel } from "@/components/engineering/lab-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { appInstanceId } from "@/lib/app-instance";
import { engineeringLabEnabled } from "@/lib/engineering-env";
import { getCurrentUser } from "@/services/current-user";

export const metadata = { title: "Engineering lab", robots: { index: false, follow: false } };

async function LabContent() {
  await connection();
  if (!engineeringLabEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/account");
  if (user.role !== "ADMIN") notFound();
  return <LabPanel instance={appInstanceId()} />;
}

export default function EngineeringLab() {
  return (
    <div className="container-wide discovery">
      <Suspense fallback={<Skeleton className="skeleton-title" role="status"><span className="sr-only">Loading engineering lab</span></Skeleton>}>
        <LabContent />
      </Suspense>
    </div>
  );
}
