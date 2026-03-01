"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { showToast } from "@/lib/toast";

type NotificationItem = {
  id: string;
  type: "TEAM_INVITE" | "REPORT_PENDING_REVIEW" | "REPORT_APPROVED" | "REPORT_REJECTED" | "TOURNAMENT_ADVANCEMENT";
  title: string;
  body: string;
  actionUrl: string | null;
  matchReportId: string | null;
  isRead: boolean;
  createdAt: string;
  teamInvitation: {
    id: string;
    status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELED";
    team: {
      id: string;
      name: string;
      tag: string | null;
    };
    inviter: {
      id: string;
      name: string;
      username: string | null;
    };
  } | null;
};

type NotificationsPayload = {
  unreadCount: number;
  notifications: NotificationItem[];
};

async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Unexpected request failure.");
  }
  return payload as T;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<NotificationsPayload>({
    unreadCount: 0,
    notifications: []
  });
  const rootRef = useRef<HTMLDivElement | null>(null);

  const unreadBadge = useMemo(() => {
    if (data.unreadCount <= 0) {
      return "";
    }
    if (data.unreadCount > 99) {
      return "99+";
    }
    return String(data.unreadCount);
  }, [data.unreadCount]);

  async function loadNotifications() {
    setLoading(true);
    try {
      const payload = await callApi<NotificationsPayload>("/api/notifications");
      setData(payload);
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Could not load notifications.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadNotifications();
  }, [open]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

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

  async function markAllRead() {
    setSubmitting(true);
    try {
      await callApi("/api/notifications/read-all", {
        method: "POST"
      });
      await loadNotifications();
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Could not mark notifications as read.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function clearNotifications() {
    setSubmitting(true);
    try {
      await callApi("/api/notifications/clear", {
        method: "POST"
      });
      setData({
        unreadCount: 0,
        notifications: []
      });
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Could not clear notifications.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function markRead(notificationId: string) {
    try {
      await callApi(`/api/notifications/${notificationId}/read`, {
        method: "POST"
      });
      setData((current) => ({
        unreadCount: Math.max(0, current.unreadCount - (current.notifications.find((item) => item.id === notificationId)?.isRead ? 0 : 1)),
        notifications: current.notifications.map((item) =>
          item.id === notificationId
            ? {
                ...item,
                isRead: true
              }
            : item
        )
      }));
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Could not update notification.", "error");
    }
  }

  async function respondToInvite(notification: NotificationItem, accept: boolean) {
    if (!notification.teamInvitation?.id) {
      return;
    }
    setSubmitting(true);
    try {
      await callApi(`/api/team-invitations/${notification.teamInvitation.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ accept })
      });
      await markRead(notification.id);
      await loadNotifications();
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Could not respond to invitation.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function reviewPendingReport(notification: NotificationItem, approve: boolean) {
    if (!notification.matchReportId) {
      return;
    }
    setSubmitting(true);
    try {
      await callApi(`/api/reports/${notification.matchReportId}/approve`, {
        method: "POST",
        body: JSON.stringify({ approve })
      });
      await loadNotifications();
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Could not review result.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        className="btn relative inline-flex h-10 w-10 items-center justify-center !p-0 leading-none"
        onClick={() => setOpen((value) => !value)}
        style={{ padding: 0, lineHeight: 0 }}
        type="button"
      >
        <svg aria-hidden="true" className="h-[84%] w-[84%]" fill="none" viewBox="0 0 24 24">
          <path
            d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
        {unreadBadge ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[#ef4444] px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
            {unreadBadge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-[130] mt-2 w-[380px] max-w-[92vw] rounded-md border border-border bg-[#161B22] p-2 shadow-panel">
          <div className="mb-2 flex items-center justify-between border-b border-border/70 px-1 pb-2">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-3">
              <button
                className="text-xs text-[#7C3AED] hover:text-[#22D3EE]"
                disabled={submitting}
                onClick={() => void markAllRead()}
                type="button"
              >
                Mark all read
              </button>
              <button className="text-xs text-[#9AA4B2] hover:text-[#E6EDF3]" disabled={submitting} onClick={() => void clearNotifications()} type="button">
                Clear
              </button>
            </div>
          </div>

          {loading ? <p className="px-1 py-2 text-xs text-muted">Loading...</p> : null}

          {!loading && data.notifications.length === 0 ? <p className="px-1 py-2 text-xs text-muted">No notifications.</p> : null}

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {data.notifications.map((notification) => {
              const isPendingInvite =
                notification.type === "TEAM_INVITE" && notification.teamInvitation?.status === "PENDING";
              const isPendingReview = notification.type === "REPORT_PENDING_REVIEW" && Boolean(notification.matchReportId);

              return (
                <article
                  className={`rounded border border-border/70 bg-[#161B22] p-2 ${notification.isRead ? "opacity-70" : ""}`}
                  key={notification.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{notification.title}</p>
                      <p className="mt-1 text-xs text-muted">{notification.body}</p>
                    </div>
                    {!notification.isRead ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#ef4444]" /> : null}
                  </div>

                  <p className="mt-2 text-[11px] text-muted">{formatDate(notification.createdAt)}</p>

                  {isPendingInvite ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        className="btn btn-primary px-2 py-1 text-xs leading-tight"
                        disabled={submitting}
                        onClick={() => void respondToInvite(notification, true)}
                        type="button"
                      >
                        Accept
                      </button>
                      <button className="btn px-2 py-1 text-xs leading-tight" disabled={submitting} onClick={() => void respondToInvite(notification, false)} type="button">
                        Decline
                      </button>
                    </div>
                  ) : isPendingReview ? (
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        className="btn btn-primary px-2 py-1 text-xs leading-tight"
                        disabled={submitting}
                        onClick={() => void reviewPendingReport(notification, true)}
                        type="button"
                      >
                        Accept
                      </button>
                      <button className="btn px-2 py-1 text-xs leading-tight" disabled={submitting} onClick={() => void reviewPendingReport(notification, false)} type="button">
                        Decline
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      {notification.actionUrl ? (
                        <Link
                          className="btn px-2 py-1 text-xs leading-tight"
                          href={notification.actionUrl}
                          onClick={() => {
                            void markRead(notification.id);
                            setOpen(false);
                          }}
                        >
                          Open
                        </Link>
                      ) : null}
                      {!notification.isRead ? (
                        <button className="btn px-2 py-1 text-xs leading-tight" onClick={() => void markRead(notification.id)} type="button">
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
