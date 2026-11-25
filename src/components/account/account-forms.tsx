"use client";

import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useActionState, useState, type FormEvent } from "react";
import { registerAction } from "@/app/account/actions";
import { Button } from "@/components/ui/button";

function CredentialsFields({ register = false }: { register?: boolean }) {
  return (
    <>
      <label className="field-label">Email
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
      </label>
      <label className="field-label">Password
        <input
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          required
          minLength={register ? 15 : undefined}
          maxLength={128}
          aria-describedby={register ? "password-help" : undefined}
        />
        {register && <small id="password-help">Use at least 15 characters.</small>}
      </label>
    </>
  );
}

export function RegisterForm() {
  const [message, action, pending] = useActionState(registerAction, null);
  return (
    <form action={action} className="account-form">
      <label className="field-label">Name
        <input name="name" autoComplete="name" required minLength={2} maxLength={80} />
      </label>
      <CredentialsFields register />
      {message && <p role="alert" className="account-error">{message}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
    </form>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setPending(true);

    try {
      const result = await signIn("credentials", {
        email: form.get("email"),
        password: form.get("password"),
        redirect: false,
        callbackUrl: "/account",
      });
      if (result?.ok && !result.error) {
        router.replace("/account");
        router.refresh();
        return;
      }
      setMessage(result?.error === "CredentialsSignin"
        ? "The email or password is incorrect."
        : "Could not log in. Try again.");
    } catch {
      setMessage("Could not log in. Try again.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} method="post" action="/api/auth/signin" className="account-form">
      <CredentialsFields />
      {message && <p role="alert" className="account-error">{message}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Logging in…" : "Log in"}</Button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    setPending(true);
    setError(false);
    try {
      const result = await signOut({ callbackUrl: "/account", redirect: false });
      if (!result?.url) throw new Error("Sign-out response missing.");
      router.replace("/account");
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div>
      <Button variant="outline" disabled={pending} onClick={submit}>{pending ? "Signing out…" : "Sign out"}</Button>
      {error && <p role="alert" className="account-error">Could not sign out. Try again.</p>}
    </div>
  );
}
