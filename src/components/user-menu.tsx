"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

type UserMenuProps = {
  displayName: string;
  profileTag: string;
  profileImageUrl: string | null;
  isAdmin: boolean;
};

export function UserMenu({ displayName, profileTag, profileImageUrl, isAdmin }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

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
      <button
        className="btn relative h-10 w-10 overflow-hidden p-0 leading-none"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {profileImageUrl ? (
          <img
            alt={displayName}
            className="absolute inset-0 block h-full w-full scale-105 object-cover object-center"
            src={profileImageUrl}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#141c2c] text-sm font-semibold text-text">{initial}</div>
        )}
      </button>
      {open ? (
        <div className="absolute right-0 z-[120] mt-2 w-44 rounded-md border border-border bg-[#0f1728] p-1 shadow-panel">
          <div className="mb-1 rounded px-2 py-2">
            <p className="truncate text-sm font-semibold text-text">{displayName}</p>
            <p className="truncate text-xs text-muted">{profileTag}</p>
          </div>
          <div className="mb-1 border-t border-border/70" />
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
