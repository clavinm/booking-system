import { isLabOrigin } from "../../src/lib/engineering-env";

export async function readHealth(origin: string) {
  if (!isLabOrigin(origin)) throw new Error("Use loopback HTTP origins for the load test.");
  const res = await fetch(`${origin}/api/health`, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  const instance = res.headers.get("X-SeatSync-Instance");
  if (!res.ok || !instance) throw new Error("The app did not return a healthy status and instance header.");
  return { origin, instance };
}

export async function getLabCookie(origin: string, email: string, password: string) {
  if (!isLabOrigin(origin)) throw new Error("Use a loopback HTTP origin for lab sign-in.");
  const cookies = (res: Response) => res.headers.getSetCookie().map((value) => value.split(";")[0]);
  const csrf = await fetch(`${origin}/api/auth/csrf`, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  const { csrfToken } = await csrf.json();
  const result = await fetch(`${origin}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(20_000),
    headers: { Cookie: cookies(csrf).join("; ") },
    body: new URLSearchParams({ email, password, csrfToken, json: "true", callbackUrl: `${origin}/account` }),
  });
  const session = cookies(result).find((cookie) => /session-token=/.test(cookie));
  if (!session) throw new Error("Lab sign-in failed. Check that both app instances share the lab database and AUTH_SECRET.");
  return session;
}
