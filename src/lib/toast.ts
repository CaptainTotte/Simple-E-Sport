"use client";

export type ToastVariant = "success" | "error" | "info";

export type ToastPayload = {
  message: string;
  variant?: ToastVariant;
};

const TOAST_EVENT_NAME = "simple-esport-toast";

export function showToast(message: string, variant: ToastVariant = "info") {
  if (typeof window === "undefined") {
    return;
  }
  const payload: ToastPayload = { message, variant };
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT_NAME, { detail: payload }));
}

export function onToast(listener: (payload: ToastPayload) => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }
    const detail = event.detail as ToastPayload | undefined;
    if (!detail?.message) {
      return;
    }
    listener(detail);
  };

  window.addEventListener(TOAST_EVENT_NAME, handler as EventListener);
  return () => window.removeEventListener(TOAST_EVENT_NAME, handler as EventListener);
}

