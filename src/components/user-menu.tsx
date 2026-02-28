"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

type UserMenuProps = {
  username: string;
  roleLabel: string;
  isAdmin: boolean;
};

export function UserMenu({ username, roleLabel, isAdmin }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current) {
        return;
      }
      const target = event.target;
      if (target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button className="rounded-md border border-border px-2 py-1 leading-tight" onClick={() => setOpen((value) => !value)} type="button">
        <p className="text-xs font-semibold text-text">{username}</p>
        <p className="text-[10px] text-muted">{roleLabel}</p>
      </button>
      {open ? (
        <div className="absolute right-0 z-[120] mt-2 w-44 rounded-md border border-border bg-[#0f1728] p-1 shadow-panel">
          <Link className="block rounded px-2 py-1 text-sm hover:bg-[#1a2640]" href="/profile" onClick={() => setOpen(false)}>
            Profile
          </Link>
          {isAdmin ? (
            <Link className="mt-1 block rounded px-2 py-1 text-sm hover:bg-[#1a2640]" href="/admin" onClick={() => setOpen(false)}>
              Admin
            </Link>
          ) : null}
          <SignOutButton className="mt-1 w-full rounded px-2 py-1 text-left text-sm hover:bg-[#1a2640]" />
        </div>
      ) : null}
    </div>
  );
}
