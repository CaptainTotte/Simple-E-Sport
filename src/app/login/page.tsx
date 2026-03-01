"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { showToast } from "@/lib/toast";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("password");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast(payload.error ?? "Login failed.", "error");
        return;
      }

      const target = searchParams.get("next") || "/";
      router.push(target);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container py-10">
      <section className="mx-auto w-full max-w-md panel">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Welcome Back</p>
        <h1 className="mt-2 text-2xl font-semibold">Login</h1>
        <p className="mt-2 text-sm text-muted">Default admin credentials: admin / password</p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <input
            autoComplete="username"
            className="input"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            value={username}
          />
          <input
            autoComplete="current-password"
            className="input"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            value={password}
          />
          <button className="btn btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-sm text-muted">
          Need an account?{" "}
          <Link className="text-accent" href="/register">
            Register
          </Link>
        </p>
      </section>
    </main>
  );
}
