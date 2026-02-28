import type { Metadata } from "next";
import Link from "next/link";
import { NotificationBell } from "@/components/notification-bell";
import { ReportMenu } from "@/components/report-menu";
import { UserMenu } from "@/components/user-menu";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simple E-Sport",
  description: "Configurable e-sport tournament platform (single elimination MVP)"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser(prisma);
  const isAdmin = user?.globalRole === "PLATFORM_ADMIN" || user?.globalRole === "TOURNAMENT_ADMIN";
  const profileTag = user?.username ? `@${user.username}` : "No tag";

  return (
    <html lang="en">
      <body>
        <header className="relative z-[80] border-b border-border/70 bg-[#0b1220]/90 backdrop-blur">
          <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
            <Link className="text-lg font-semibold tracking-wide" href="/">
              Simple E-Sport
            </Link>
            <nav className="relative z-[90] flex items-center gap-2">
              <Link className="btn" href="/highscore">
                Highscore
              </Link>
              {user ? (
                <>
                  <ReportMenu />
                  <NotificationBell />
                  <UserMenu
                    displayName={user.name}
                    isAdmin={Boolean(isAdmin)}
                    profileImageUrl={user.profileImageUrl}
                    profileTag={profileTag}
                  />
                </>
              ) : (
                <>
                  <Link className="btn" href="/login">
                    Login
                  </Link>
                  <Link className="btn btn-primary" href="/register">
                    Register
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
