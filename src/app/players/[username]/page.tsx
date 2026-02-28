import { ReportStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: {
    username: string;
  };
};

type PlayedTournament = {
  id: string;
  name: string;
  status: string;
  gameName: string;
  modeLabel: string;
  approvedResults: number;
  lastActivity: Date;
};

function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const username = normalizeUsername(params.username);

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      name: true,
      username: true,
      profileImageUrl: true,
      memberships: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1,
        select: {
          role: true,
          team: {
            select: {
              id: true,
              name: true,
              tag: true,
              logoUrl: true
            }
          }
        }
      }
    }
  });

  if (!user || !user.username) {
    notFound();
  }

  const approvedReports = await prisma.matchReport.findMany({
    where: {
      status: ReportStatus.APPROVED,
      OR: [
        {
          submittedById: user.id
        },
        {
          submittingTeam: {
            members: {
              some: {
                userId: user.id
              }
            }
          }
        }
      ]
    },
    select: {
      id: true,
      createdAt: true,
      match: {
        select: {
          bracket: {
            select: {
              tournament: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  ruleset: {
                    select: {
                      game: {
                        select: {
                          name: true
                        }
                      },
                      mode: {
                        select: {
                          label: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  const tournamentsById = new Map<string, PlayedTournament>();
  for (const report of approvedReports) {
    const tournament = report.match.bracket.tournament;
    const existing = tournamentsById.get(tournament.id);
    if (existing) {
      existing.approvedResults += 1;
      if (report.createdAt.getTime() > existing.lastActivity.getTime()) {
        existing.lastActivity = report.createdAt;
      }
      continue;
    }

    tournamentsById.set(tournament.id, {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      gameName: tournament.ruleset?.game.name ?? "Unknown",
      modeLabel: tournament.ruleset?.mode.label ?? "-",
      approvedResults: 1,
      lastActivity: report.createdAt
    });
  }

  const playedTournaments = [...tournamentsById.values()].sort(
    (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
  );
  const currentMembership = user.memberships[0] ?? null;
  const initials = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <main className="container py-8">
      <section className="panel">
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="w-44 max-w-full">
            <div className="h-44 w-44 max-w-full overflow-hidden rounded-lg border border-border/70 bg-[#10182a]">
              {user.profileImageUrl ? (
                <img alt={user.name} className="h-full w-full object-cover" src={user.profileImageUrl} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl font-semibold text-muted">{initials}</div>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-border/60 bg-[#111827] p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-muted">Personal</p>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-muted">Display Name</span>
                <span className="max-w-[60%] truncate text-right font-medium">{user.name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-muted">Username</span>
                <span className="font-medium">@{user.username}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-muted">Team role</span>
                <span className="font-medium">{currentMembership?.role ?? "N/A"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-border/70 bg-[#141821] p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-muted">Current Team</p>
              {currentMembership ? (
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-md border border-border/70 bg-[#10182a]">
                    {currentMembership.team.logoUrl ? (
                      <img alt={currentMembership.team.name} className="h-full w-full object-cover" src={currentMembership.team.logoUrl} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">No logo</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {currentMembership.team.name}
                      {currentMembership.team.tag ? ` [${currentMembership.team.tag}]` : ""}
                    </p>
                    <p className="text-xs text-muted">{currentMembership.role}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">Not currently in a team.</p>
              )}
            </div>

            <div className="rounded-lg border border-border/70 bg-[#141821] p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-muted">Played Tournaments</p>
              <p className="mt-1 text-2xl font-semibold">{playedTournaments.length}</p>
              <p className="mt-1 text-xs text-muted">Requires at least one approved result.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-border/70 pt-4">
          <h2 className="text-lg font-semibold">Tournaments Played</h2>
          <p className="mt-1 text-sm text-muted">Only tournaments with at least one approved result are counted.</p>

          {playedTournaments.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No approved tournament results yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {playedTournaments.map((tournament) => (
                <article className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-[#141821] p-3" key={tournament.id}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{tournament.name}</p>
                    <p className="text-xs text-muted">
                      {tournament.gameName} · {tournament.modeLabel} · Status: {tournament.status}
                    </p>
                    <p className="text-xs text-muted">Approved results in tournament: {tournament.approvedResults}</p>
                  </div>
                  <Link className="btn" href={`/tournaments/${tournament.id}`}>
                    Open
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
