"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name, username, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Registration failed.");
        return;
      }

      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container py-10">
      <section className="mx-auto w-full max-w-md panel">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Create Account</p>
        <h1 className="mt-2 text-2xl font-semibold">Register</h1>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <input
            autoComplete="name"
            className="input"
            onChange={(event) => setName(event.target.value)}
            placeholder="Display name"
            value={name}
          />
          <input
            autoComplete="username"
            className="input"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            value={username}
          />
          <input
            autoComplete="new-password"
            className="input"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            value={password}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button className="btn btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-sm text-muted">
          Already have an account?{" "}
          <Link className="text-accent" href="/login">
            Login
          </Link>
        </p>
      </section>
    </main>
  );
}
