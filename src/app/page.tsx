import Image from "next/image";
import Link from "next/link";
import { TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ACTIVE_STATUSES = [TournamentStatus.REGISTRATION_OPEN, TournamentStatus.LIVE];

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
  const tournaments = await prisma.tournament.findMany({
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
  });

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
              <article className="overflow-hidden panel p-0" key={tournament.id}>
                <div className="relative h-40 w-full">
                  <Image
                    alt={tournament.ruleset?.game.name ?? "Game image"}
                    className="h-full w-full object-cover"
                    fill
                    src={tournament.ruleset?.game.imageUrl ?? "/games/valorant.svg"}
                  />
                  <div className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-xs font-medium">
                    {statusLabel(tournament.status)}
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">{tournament.ruleset?.game.name}</p>
                  <h3 className="mt-1 text-lg font-semibold">{tournament.name}</h3>
                  <p className="mt-2 text-sm text-muted">Mode: {tournament.ruleset?.mode.label}</p>
                  <p className="text-sm text-muted">
                    Teams: {tournament._count.registrations}/{tournament.teamLimit}
                  </p>
                  <Link className="btn btn-primary mt-3 inline-flex" href={`/tournaments/${tournament.id}`}>
                    Open Tournament
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
