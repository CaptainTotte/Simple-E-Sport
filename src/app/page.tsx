import Image from "next/image";
import Link from "next/link";
import { TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ACTIVE_STATUSES = [TournamentStatus.REGISTRATION_OPEN, TournamentStatus.LIVE];

const GAME_BANNER_EXT: Record<string, string> = {
  "valorant": "png",
};

function gameBannerSrc(slug: string): string {
  const ext = GAME_BANNER_EXT[slug] ?? "jpg";
  return `/games/banners/${slug}.${ext}`;
}

function statusLabel(status: TournamentStatus) {
  if (status === TournamentStatus.REGISTRATION_OPEN) {
    return "Open For Registration";
  }
  if (status === TournamentStatus.LIVE) {
    return "Live";
  }
  return status;
}

export default async function HomePage() {
  const [tournaments, completedTournaments] = await Promise.all([
    prisma.tournament.findMany({
      where: {
        status: {
          in: ACTIVE_STATUSES
        },
        ruleset: {
          isNot: null
        }
      },
      include: {
        ruleset: {
          include: {
            game: true,
            mode: true
          }
        },
        _count: {
          select: {
            registrations: true
          }
        }
      },
      orderBy: [{ status: "desc" }, { createdAt: "desc" }]
    }),
    prisma.tournament.findMany({
      where: {
        status: TournamentStatus.COMPLETED,
        ruleset: {
          isNot: null
        }
      },
      include: {
        bracket: {
          include: {
            matches: {
              orderBy: [{ round: "desc" }, { position: "asc" }],
              take: 1,
              include: {
                winnerTeam: true
              }
            }
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 12
    })
  ]);

  return (
    <main className="container py-8">
      <section className="panel">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Active Tournaments</p>
          <h1 className="mt-2 text-3xl font-semibold">Join or Follow Ongoing Competitions</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Single-elimination tournaments across multiple games with configurable modes, pools, and admin-reviewed
            match reporting.
          </p>
        </div>
      </section>

      <section className="mt-6">
        {tournaments.length === 0 ? (
          <div className="panel">
            <h2 className="text-lg font-semibold">No active tournaments right now</h2>
            <p className="mt-2 text-sm text-muted">Admins can create one from the admin console.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((tournament) => (
              <article className="flex flex-col overflow-hidden panel p-0" key={tournament.id}>
                <div className="relative h-40 w-full">
                  <Image
                    alt={tournament.ruleset?.game.name ?? "Game"}
                    className="object-cover"
                    fill
                    src={gameBannerSrc(tournament.ruleset?.game.slug ?? "valorant")}
                  />
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-xs font-medium">
                    {statusLabel(tournament.status)}
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">{tournament.ruleset?.game.name}</p>
                    <h3 className="mt-1 text-lg font-semibold">{tournament.name}</h3>
                    <p className="mt-2 text-sm text-muted">Mode: {tournament.ruleset?.mode.label}</p>
                    <p className="text-sm text-muted">
                      Teams: {tournament._count.registrations}/{tournament.teamLimit}
                    </p>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Link className="btn btn-primary inline-flex" href={`/tournaments/${tournament.id}`}>
                      Open Tournament
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel mt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Completed Tournaments</p>
        <h2 className="mt-2 text-xl font-semibold">Recent Winners</h2>
        {completedTournaments.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No completed tournaments yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] table-fixed border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="w-[65%] py-2 pr-2">Tournament</th>
                  <th className="w-[35%] py-2">Winner</th>
                </tr>
              </thead>
              <tbody>
                {completedTournaments.map((tournament) => (
                  <tr className="border-b border-border/60" key={tournament.id}>
                    <td className="py-2 pr-2">
                      <Link className="truncate font-medium transition-colors hover:text-[#7C6EFF]" href={`/tournaments/${tournament.id}`}>
                        {tournament.name}
                      </Link>
                    </td>
                    <td className="py-2">{tournament.bracket?.matches[0]?.winnerTeam?.name ?? "No winner"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
