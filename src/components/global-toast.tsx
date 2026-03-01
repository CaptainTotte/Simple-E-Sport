"use client";

import { useEffect, useRef, useState } from "react";
import { onToast, type ToastPayload } from "@/lib/toast";

type ToastState = {
  message: string;
  variant: "success" | "error" | "info";
  token: number;
} | null;

const TOAST_DURATION_MS = 2000;

export function GlobalToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return onToast((payload: ToastPayload) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }

      setToast({
        message: payload.message,
        variant: payload.variant ?? "info",
        token: Date.now()
      });

      timerRef.current = window.setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, TOAST_DURATION_MS);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!toast) {
    return null;
  }

  const variantClass =
    toast.variant === "success"
      ? "border-[#2DD4BF] bg-gradient-to-r from-[#6D5DFC] to-[#7C6EFF] text-[#E5E7EB] shadow-[0_0_22px_rgba(109, 93, 252, 0.5),0_0_0_1px_rgba(34,211,238,0.5)]"
      : toast.variant === "error"
        ? "border-[#EF4444] bg-[#2A1318] text-[#E5E7EB] shadow-[0_0_14px_rgba(239,68,68,0.3)]"
        : "border-border bg-[#202329] text-text shadow-panel";

  return (
    <div className="pointer-events-none fixed inset-0 z-[220] flex items-center justify-center p-4">
      <div
        className={`rounded-xl border px-5 py-3 text-sm font-semibold tracking-[0.02em] ${variantClass}`}
        key={toast.token}
        role="status"
      >
        {toast.message}
      </div>
    </div>
  );
}
