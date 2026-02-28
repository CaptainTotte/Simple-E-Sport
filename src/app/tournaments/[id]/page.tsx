import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import TournamentTabs from "@/app/tournaments/[id]/tournament-tabs";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: {
    id: string;
  };
};

export default async function TournamentPage({ params }: PageProps) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      ruleset: {
        include: {
          game: true,
          mode: true,
          poolItems: {
            include: {
              contextItem: true
            },
            orderBy: {
              position: "asc"
            }
          }
        }
      },
      registrations: {
        include: {
          team: {
            include: {
              members: {
                include: {
                  user: true
                },
                orderBy: {
                  createdAt: "asc"
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      _count: {
        select: {
          registrations: true
        }
      },
      bracket: {
        include: {
          matches: {
            include: {
              participantATeam: true,
              participantBTeam: true,
              winnerTeam: true,
              reports: {
                include: {
                  proofAssets: true
                },
                orderBy: {
                  createdAt: "desc"
                }
              }
            },
            orderBy: [{ round: "asc" }, { position: "asc" }]
          }
        }
      }
    }
  });

  if (!tournament) {
    notFound();
  }

  const matches =
    tournament.bracket?.matches.map((match) => ({
      id: match.id,
      round: match.round,
      position: match.position,
      status: match.status,
      participantATeamName: match.participantATeam?.name ?? null,
      participantBTeamName: match.participantBTeam?.name ?? null,
      winnerTeamName: match.winnerTeam?.name ?? null,
      latestReportId: match.reports[0]?.id ?? null,
      latestReportStatus: match.reports[0]?.status ?? null,
      latestProofUrl: match.reports[0]?.proofAssets[0]?.publicUrl ?? null
    })) ?? [];

  const ruleset = tournament.ruleset
    ? {
        gameName: tournament.ruleset.game.name,
        modeLabel: tournament.ruleset.mode.label,
        teamSize: tournament.ruleset.mode.teamSize,
        teamLimit: tournament.teamLimit,
        poolStrategy: tournament.ruleset.poolStrategy,
        randomPoolSize: tournament.ruleset.randomPoolSize,
        poolLabels: tournament.ruleset.poolItems
          .map((item) => item.contextItem?.name ?? item.customLabel)
          .filter((item): item is string => Boolean(item))
      }
    : null;

  const teams = tournament.registrations.map((registration) => ({
    id: registration.team.id,
    name: registration.team.name,
    tag: registration.team.tag,
    status: registration.status,
    members: registration.team.members.map((member) => ({
      id: member.id,
      name: member.user.name,
      role: member.role
    }))
  }));

  return (
    <main className="container py-8">
      <header className="overflow-hidden panel p-0">
        <div className="relative h-44">
          <Image
            alt={tournament.ruleset?.game.name ?? "Tournament"}
            className="h-full w-full object-cover"
            fill
            src={tournament.ruleset?.game.imageUrl ?? "/games/valorant.svg"}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-4 left-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Tournament</p>
            <h1 className="text-2xl font-semibold">{tournament.name}</h1>
            <p className="text-sm text-muted">Status: {tournament.status}</p>
            <p className="text-xs text-muted">
              Teams: {tournament._count.registrations}/{tournament.teamLimit}
            </p>
          </div>
          <div className="absolute right-4 top-4">
            <Link className="btn" href="/">
              Back
            </Link>
          </div>
        </div>
      </header>

      <TournamentTabs matches={matches} ruleset={ruleset} teams={teams} />
    </main>
  );
}
