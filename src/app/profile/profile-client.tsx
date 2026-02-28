"use client";

import { useState } from "react";

type ProfileClientProps = {
  name: string;
  username: string;
};

export default function ProfileClient({ name, username }: ProfileClientProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmNewPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not update password.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setSuccess("Password updated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container py-8">
      <section className="panel mx-auto max-w-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Profile</p>
        <h1 className="mt-2 text-2xl font-semibold">{name}</h1>
        <p className="mt-1 text-sm text-muted">@{username}</p>

        <form className="mt-6 space-y-3" onSubmit={submit}>
          <input
            autoComplete="current-password"
            className="input"
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Current password"
            type="password"
            value={currentPassword}
          />
          <input
            autoComplete="new-password"
            className="input"
            minLength={6}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
            type="password"
            value={newPassword}
          />
          <input
            autoComplete="new-password"
            className="input"
            minLength={6}
            onChange={(event) => setConfirmNewPassword(event.target.value)}
            placeholder="Confirm new password"
            type="password"
            value={confirmNewPassword}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {success ? <p className="text-sm text-success">{success}</p> : null}
          <button className="btn btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}
