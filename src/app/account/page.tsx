import Link from "next/link";
import { Suspense } from "react";
import { UserRound } from "lucide-react";
import { LoginForm, RegisterForm } from "@/components/account/account-forms";
import { MemberDashboard } from "@/components/dashboard/member-dashboard";
import { bookingQuery } from "@/validations/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/services/current-user";

export const metadata = { title: "Account", robots: { index: false, follow: false } };

async function AccountContent({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  const [user, { mode, registered, error, view, page }] = await Promise.all([getCurrentUser(), searchParams]);
  if (user) {
    const selected = bookingQuery.safeParse({ view, page });
    return <MemberDashboard user={user} tab={selected.data?.view ?? "upcoming"} page={selected.data?.page ?? 1} />;
  }

  const registering = mode === "register";
  return (
    <section className="account-card">
      <span className="tile-icon"><UserRound size={24} aria-hidden="true" /></span>
      <h1>{registering ? "Create an account" : "Log in to SeatSync"}</h1>
      {registered === "1" && !registering && <p role="status" className="account-success">Your account is ready. Log in to continue.</p>}
      {typeof error === "string" && !registering && (
        <p role="alert" className="account-error">{error === "CredentialsSignin" ? "The email or password is incorrect." : "Could not log in. Try again."}</p>
      )}
      {registering ? <RegisterForm /> : <LoginForm />}
      <p className="account-switch">
        {registering ? <>Already have an account? <Link href="/account">Log in</Link></> : <>New to SeatSync? <Link href="/account?mode=register">Sign up</Link></>}
      </p>
    </section>
  );
}

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="container-wide discovery">
      <Suspense fallback={<Skeleton className="account-card account-skeleton" role="status"><span className="sr-only">Loading account</span></Skeleton>}>
        <AccountContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
