import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUserScoreSummaries } from "@/lib/scoring";

type HighscoreRow = {
  id: string;
  name: string;
  username: string | null;
  points: number;
  matchWins: number;
  tournamentWins: number;
  playedTournaments: number;
};

export default async function HighscorePage() {
  const [users, scoreMap] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true
      }
    }),
    getUserScoreSummaries(prisma)
  ]);

  const rows: HighscoreRow[] = users
    .map((user) => {
      const score = scoreMap.get(user.id);
      return {
        id: user.id,
        name: user.name,
        username: user.username,
        points: score?.points ?? 0,
        matchWins: score?.matchWins ?? 0,
        tournamentWins: score?.tournamentWins ?? 0,
        playedTournaments: score?.playedTournaments ?? 0
      };
    })
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      if (b.tournamentWins !== a.tournamentWins) {
        return b.tournamentWins - a.tournamentWins;
      }
      if (b.matchWins !== a.matchWins) {
        return b.matchWins - a.matchWins;
      }
      return a.name.localeCompare(b.name);
    });

  return (
    <main className="container py-8">
      <section className="panel">
        <h1 className="text-2xl font-semibold">Highscore</h1>
        <p className="mt-1 text-sm text-muted">Player rankings based on approved results.</p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="bg-[#121a2c] text-left text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2 text-right">Points</th>
                <th className="px-3 py-2 text-right">Wins</th>
                <th className="px-3 py-2 text-right">Tournament Wins</th>
                <th className="px-3 py-2 text-right">Played Tournaments</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr className="border-t border-border/60 bg-[#0f1626]" key={row.id}>
                  <td className="px-3 py-2 text-muted">{index + 1}</td>
                  <td className="px-3 py-2">
                    {row.username ? (
                      <Link className="font-medium transition-colors hover:text-[#6ed6ff]" href={`/players/${row.username}`}>
                        {row.name}
                        <span className="ml-1 text-xs text-muted">@{row.username}</span>
                      </Link>
                    ) : (
                      <span className="font-medium">{row.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{row.points}</td>
                  <td className="px-3 py-2 text-right">{row.matchWins}</td>
                  <td className="px-3 py-2 text-right">{row.tournamentWins}</td>
                  <td className="px-3 py-2 text-right">{row.playedTournaments}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-5 text-center text-sm text-muted" colSpan={6}>
                    No players found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg border border-border/70 bg-[#141821] p-3 text-xs text-muted">
          <p>Scoring rules:</p>
          <p className="mt-1">+10 per approved match win. Tournament winner bonus: 4-team +10, 8-team +20, 16-team +30.</p>
        </div>
      </section>
    </main>
  );
}

