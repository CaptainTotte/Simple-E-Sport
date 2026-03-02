import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import TournamentTabs from "@/app/tournaments/[id]/tournament-tabs";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: {
    id: string;
  };
};

const GAME_BANNER_EXT: Record<string, string> = {
  "valorant": "png",
};

function gameBannerSrc(slug: string): string {
  const ext = GAME_BANNER_EXT[slug] ?? "jpg";
  return `/games/banners/${slug}.${ext}`;
}

function roundPoolFromFrozenConfig(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const maybeRoundPool = (value as { roundPool?: unknown }).roundPool;
  if (!Array.isArray(maybeRoundPool)) {
    return [];
  }
  return maybeRoundPool
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const name = (entry as { name?: unknown }).name;
      return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
    })
    .filter((entry): entry is string => Boolean(entry));
}

export default async function TournamentPage({ params }: PageProps) {
  const currentUser = await getCurrentUser(prisma);
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

  const viewerMembership = currentUser
    ? await prisma.teamMember.findFirst({
        where: {
          userId: currentUser.id
        },
        include: {
          team: {
            include: {
              members: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      })
    : null;

  const matches =
    tournament.bracket?.matches.map((match) => ({
      id: match.id,
      round: match.round,
      position: match.position,
      status: match.status,
      participantATeamId: match.participantATeam?.id ?? null,
      participantBTeamId: match.participantBTeam?.id ?? null,
      participantATeamName: match.participantATeam?.name ?? null,
      participantBTeamName: match.participantBTeam?.name ?? null,
      winnerTeamId: match.winnerTeam?.id ?? null,
      winnerTeamName: match.winnerTeam?.name ?? null,
      scoreA: match.scoreA ?? null,
      scoreB: match.scoreB ?? null,
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
      rulesText: tournament.description,
      poolStrategy: tournament.ruleset.poolStrategy,
      randomPoolSize: tournament.ruleset.randomPoolSize,
      poolLabels: tournament.ruleset.poolItems
        .map((item) => item.contextItem?.name ?? item.customLabel)
        .filter((item): item is string => Boolean(item)),
      roundPool: roundPoolFromFrozenConfig(tournament.ruleset.frozenConfig)
    }
  : null;

  const teams = tournament.registrations.map((registration) => ({
    id: registration.team.id,
    name: registration.team.name,
    tag: registration.team.tag,
    logoUrl: registration.team.logoUrl ?? null,
    status: registration.status,
    members: registration.team.members.map((member) => ({
      id: member.id,
      name: member.user?.name ?? member.displayName ?? "Unnamed",
      username: member.user?.username ?? null,
      role: member.role,
      profileImageUrl: member.user?.profileImageUrl ?? null
    }))
  }));

  const viewerTeam = viewerMembership
    ? {
        id: viewerMembership.team.id,
        name: viewerMembership.team.name,
        memberCount: viewerMembership.team.members.length,
        myRole: viewerMembership.role,
        alreadyRegistered: tournament.registrations.some((registration) => registration.teamId === viewerMembership.team.id)
      }
    : null;

  return (
    <main className="container py-8">
      <header className="overflow-hidden panel p-0">
        <div className="relative h-44">
          <Image
            alt={tournament.ruleset?.game.name ?? "Tournament"}
            className="object-cover"
            fill
            src={gameBannerSrc(tournament.ruleset?.game.slug ?? "valorant")}
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

      <TournamentTabs
        matches={matches}
        registeredCount={tournament._count.registrations}
        requiredTeamSize={tournament.ruleset?.mode.teamSize ?? null}
        ruleset={ruleset}
        teamLimit={tournament.teamLimit}
        teams={teams}
        tournamentId={tournament.id}
        tournamentStatus={tournament.status}
        viewerRole={currentUser?.globalRole ?? null}
        viewerTeam={viewerTeam}
      />
    </main>
  );
}
