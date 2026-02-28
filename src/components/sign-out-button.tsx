"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SignOutButtonProps = {
  className?: string;
  label?: string;
};

export function SignOutButton({ className, label }: SignOutButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  return (
    <button
      className={className ?? "btn"}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await fetch("/api/auth/logout", {
            method: "POST"
          });
          router.push("/login");
          router.refresh();
        } finally {
          setLoading(false);
        }
      }}
      type="button"
    >
      {loading ? "Signing out..." : label ?? "Sign out"}
    </button>
  );
}
