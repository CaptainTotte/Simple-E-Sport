import { NotificationType, PrismaClient, RegistrationStatus, TournamentStatus } from "@prisma/client";

const prisma = new PrismaClient();

type CliOptions = {
  lookaheadMinutes: number;
  graceMinutes: number;
  dryRun: boolean;
};

function parseNumberFlag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --${name} value: ${raw}`);
  }
  return parsed;
}

function parseOptions(): CliOptions {
  return {
    lookaheadMinutes: parseNumberFlag("lookahead-minutes", Number(process.env.REMINDER_LOOKAHEAD_MINUTES ?? 15)),
    graceMinutes: parseNumberFlag("grace-minutes", Number(process.env.REMINDER_GRACE_MINUTES ?? 30)),
    dryRun: process.argv.includes("--dry-run")
  };
}

function formatStartsAt(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

async function main() {
  const options = parseOptions();
  const now = new Date();
  const windowStart = new Date(now.getTime() - options.graceMinutes * 60 * 1000);
  const windowEnd = new Date(now.getTime() + options.lookaheadMinutes * 60 * 1000);

  const tournaments = await prisma.tournament.findMany({
    where: {
      status: {
        in: [TournamentStatus.REGISTRATION_OPEN, TournamentStatus.REGISTRATION_CLOSED, TournamentStatus.LIVE]
      },
      startsAt: {
        not: null,
        gte: windowStart,
        lte: windowEnd
      },
      reminderSentAt: null
    },
    include: {
      ruleset: {
        include: {
          game: true,
          mode: true
        }
      },
      registrations: {
        where: {
          status: RegistrationStatus.APPROVED
        },
        include: {
          team: {
            include: {
              members: {
                select: {
                  userId: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: {
      startsAt: "asc"
    }
  });

  let sentTournamentCount = 0;
  let sentNotificationCount = 0;
  let skippedNoRecipients = 0;

  console.log(
    `[reminders] window=${windowStart.toISOString()}..${windowEnd.toISOString()} candidates=${tournaments.length} dryRun=${options.dryRun}`
  );

  for (const tournament of tournaments) {
    if (!tournament.startsAt) {
      continue;
    }

    const recipientUserIds = [
      ...new Set(
        tournament.registrations.flatMap((registration) =>
          registration.team.members.map((member) => member.userId).filter((userId): userId is string => Boolean(userId))
        )
      )
    ];

    if (recipientUserIds.length === 0) {
      skippedNoRecipients += 1;
      console.log(`[reminders] skip ${tournament.name} (${tournament.id}) no recipients`);
      continue;
    }

    const title = "Tournament starting soon";
    const bodyParts = [
      tournament.name,
      `starts ${formatStartsAt(tournament.startsAt)}`
    ];
    if (tournament.ruleset?.game?.name && tournament.ruleset?.mode?.label) {
      bodyParts.push(`${tournament.ruleset.game.name} ${tournament.ruleset.mode.label}`);
    }
    const body = bodyParts.join(" • ");

    if (options.dryRun) {
      console.log(
        `[reminders] dry-run ${tournament.name} (${tournament.id}) recipients=${recipientUserIds.length} startsAt=${tournament.startsAt.toISOString()}`
      );
      continue;
    }

    const sentAt = new Date();
    const createdCount = await prisma.$transaction(async (tx) => {
      const mark = await tx.tournament.updateMany({
        where: {
          id: tournament.id,
          reminderSentAt: null
        },
        data: {
          reminderSentAt: sentAt
        }
      });

      if (mark.count === 0) {
        return 0;
      }

      await tx.notification.createMany({
        data: recipientUserIds.map((userId) => ({
          userId,
          type: NotificationType.TOURNAMENT_REMINDER,
          title,
          body,
          actionUrl: `/tournaments/${tournament.id}`,
          metadata: {
            tournamentId: tournament.id,
            startsAt: tournament.startsAt?.toISOString() ?? null
          }
        }))
      });

      return recipientUserIds.length;
    });

    if (createdCount > 0) {
      sentTournamentCount += 1;
      sentNotificationCount += createdCount;
      console.log(`[reminders] sent ${tournament.name} (${tournament.id}) recipients=${createdCount}`);
    }
  }

  console.log(
    `[reminders] done sentTournaments=${sentTournamentCount} sentNotifications=${sentNotificationCount} skippedNoRecipients=${skippedNoRecipients}`
  );
}

main()
  .catch((error) => {
    console.error("[reminders] failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
