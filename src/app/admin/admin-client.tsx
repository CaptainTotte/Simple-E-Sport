"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type GameMode = {
  id: string;
  code: string;
  label: string;
  teamSize: number;
};

type GameContextItem = {
  id: string;
  name: string;
};

type Game = {
  id: string;
  slug: string;
  name: string;
  randomPoolAllowed: boolean;
  contextKind: "MAP" | "ARENA" | "THEME";
  contextLabelSingular: string;
  contextLabelPlural: string;
  modes: GameMode[];
  contextItems: GameContextItem[];
};

type Tournament = {
  id: string;
  name: string;
  status: string;
  teamLimit: number;
  ruleset?: {
    poolStrategy: "RANDOM" | "MANUAL";
    randomPoolSize: number | null;
    game: {
      name: string;
    };
    mode: {
      label: string;
      teamSize: number;
    };
  } | null;
  _count: {
    registrations: number;
  };
};

type TournamentDetail = {
  id: string;
  bracket: {
    matches: Array<{
      id: string;
      round: number;
      position: number;
      status: string;
      participantATeam: { id: string; name: string } | null;
      participantBTeam: { id: string; name: string } | null;
      reports: Array<{
        id: string;
        status: string;
        scoreA: number;
        scoreB: number;
        claimedWinnerTeamId: string;
        proofAssets: Array<{
          publicUrl: string;
        }>;
      }>;
    }>;
  } | null;
};

type AdminView = "create" | "registration" | "bracket" | "tournaments";

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

export default function AdminClientPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [feedback, setFeedback] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<AdminView>("create");

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createTeamLimit, setCreateTeamLimit] = useState<4 | 8 | 16>(8);

  const [rulesetTournamentId, setRulesetTournamentId] = useState("");
  const [rulesetGameId, setRulesetGameId] = useState("");
  const [rulesetModeId, setRulesetModeId] = useState("");
  const [poolStrategy, setPoolStrategy] = useState<"RANDOM" | "MANUAL">("RANDOM");
  const [manualContextItemIds, setManualContextItemIds] = useState<string[]>([]);

  const [registrationTournamentId, setRegistrationTournamentId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamTag, setTeamTag] = useState("");
  const [playerNames, setPlayerNames] = useState<string[]>(["", "", ""]);

  const [generateTournamentId, setGenerateTournamentId] = useState("");
  const [reportingData, setReportingData] = useState<TournamentDetail | null>(null);
  const [reportMatchId, setReportMatchId] = useState("");
  const [reportWinnerTeamId, setReportWinnerTeamId] = useState("");
  const [scoreA, setScoreA] = useState(2);
  const [scoreB, setScoreB] = useState(0);
  const [proofUrl, setProofUrl] = useState("");

  const [reviewReportId, setReviewReportId] = useState("");
  const [approveReport, setApproveReport] = useState(true);
  const [decisionNote, setDecisionNote] = useState("");

  const selectedGame = useMemo(() => games.find((game) => game.id === rulesetGameId), [games, rulesetGameId]);
  const selectedRegistrationTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === registrationTournamentId),
    [tournaments, registrationTournamentId]
  );

  const expectedTeamSize = selectedRegistrationTournament?.ruleset?.mode.teamSize ?? 3;
  const randomPoolAllowed = selectedGame?.randomPoolAllowed ?? true;
  const selectedReportingMatch = useMemo(
    () => reportingData?.bracket?.matches.find((match) => match.id === reportMatchId) ?? null,
    [reportingData, reportMatchId]
  );
  const reportableMatches = useMemo(
    () =>
      (reportingData?.bracket?.matches ?? []).filter((match) => {
        const hasPending = match.reports.some((report) => report.status === "SUBMITTED");
        return match.status === "READY" && !hasPending;
      }),
    [reportingData]
  );
  const pendingReports = useMemo(
    () =>
      (reportingData?.bracket?.matches ?? []).flatMap((match) =>
        match.reports
          .filter((report) => report.status === "SUBMITTED")
          .map((report) => ({
            ...report,
            matchId: match.id,
            matchRound: match.round,
            matchPosition: match.position,
            matchLabel: `${match.participantATeam?.name ?? "TBD"} vs ${match.participantBTeam?.name ?? "TBD"}`
          }))
      ),
    [reportingData]
  );

  async function loadReportingData(tournamentId: string) {
    if (!tournamentId) {
      setReportingData(null);
      return;
    }
    const data = await callApi<{ tournament: TournamentDetail }>(`/api/tournaments/${tournamentId}`);
    setReportingData(data.tournament);
  }

  async function loadData() {
    const [gamesData, tournamentsData] = await Promise.all([
      callApi<{ games: Game[] }>("/api/games"),
      callApi<{ tournaments: Tournament[] }>("/api/tournaments")
    ]);

    setGames(gamesData.games);
    setTournaments(tournamentsData.tournaments);

    if (!rulesetGameId && gamesData.games.length > 0) {
      setRulesetGameId(gamesData.games[0].id);
      setRulesetModeId(gamesData.games[0].modes[0]?.id ?? "");
    }

    if (!rulesetTournamentId && tournamentsData.tournaments.length > 0) {
      const fallbackTournamentId = tournamentsData.tournaments[0].id;
      setRulesetTournamentId(fallbackTournamentId);
      setRegistrationTournamentId(fallbackTournamentId);
      setGenerateTournamentId(fallbackTournamentId);
    }
  }

  useEffect(() => {
    void loadData().catch((error) => setFeedback(error.message));
  }, []);

  useEffect(() => {
    void loadReportingData(generateTournamentId).catch((error) => setFeedback(error.message));
  }, [generateTournamentId]);

  useEffect(() => {
    if (!selectedGame) {
      setRulesetModeId("");
      return;
    }
    if (!selectedGame.modes.find((mode) => mode.id === rulesetModeId)) {
      setRulesetModeId(selectedGame.modes[0]?.id ?? "");
    }
    if (!selectedGame.randomPoolAllowed && poolStrategy === "RANDOM") {
      setPoolStrategy("MANUAL");
    }
    setManualContextItemIds((previous) => previous.filter((id) => selectedGame.contextItems.some((item) => item.id === id)));
  }, [selectedGame, rulesetModeId, poolStrategy]);

  useEffect(() => {
    setPlayerNames((previous) => {
      const next = Array.from({ length: expectedTeamSize }, (_, index) => previous[index] ?? "");
      return next;
    });
  }, [expectedTeamSize]);

  useEffect(() => {
    if (!selectedReportingMatch) {
      setReportWinnerTeamId("");
      return;
    }
    const allowedIds = [selectedReportingMatch.participantATeam?.id, selectedReportingMatch.participantBTeam?.id].filter(
      (teamId): teamId is string => Boolean(teamId)
    );
    setReportWinnerTeamId((current) => (allowedIds.includes(current) ? current : allowedIds[0] ?? ""));
  }, [selectedReportingMatch]);

  useEffect(() => {
    if (!reportableMatches.find((match) => match.id === reportMatchId)) {
      setReportMatchId(reportableMatches[0]?.id ?? "");
    }
  }, [reportableMatches, reportMatchId]);

  useEffect(() => {
    if (!pendingReports.find((report) => report.id === reviewReportId)) {
      setReviewReportId(pendingReports[0]?.id ?? "");
    }
  }, [pendingReports, reviewReportId]);

  async function runAction(action: () => Promise<void>) {
    setLoading(true);
    setFeedback("");
    try {
      await action();
      await loadData();
      if (generateTournamentId) {
        await loadReportingData(generateTournamentId);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  function toggleManualPoolItem(id: string) {
    setManualContextItemIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  const menuItems: Array<{ id: AdminView; label: string; helper: string }> = [
    { id: "create", label: "Create + Game Setup", helper: "Create tournament and set game/mode" },
    { id: "registration", label: "Team Registration", helper: "Add teams and players" },
    { id: "bracket", label: "Reports", helper: "Submit and review reports" },
    { id: "tournaments", label: "Tournaments", helper: "View and delete events" }
  ];

  return (
    <main className="container py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Admin Console</p>
          <h1 className="text-2xl font-semibold">Tournament Operations</h1>
        </div>
        <div className="flex gap-2">
          <Link className="btn" href="/">
            Home
          </Link>
          <button
            className="btn"
            onClick={() =>
              runAction(async () => {
                await callApi("/api/seed-games", { method: "POST" });
                setFeedback("Game catalog reseeded.");
              })
            }
            type="button"
          >
            Seed Games
          </button>
        </div>
      </header>

      {feedback ? <p className="mb-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm">{feedback}</p> : null}

      <section className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="panel h-fit lg:sticky lg:top-24">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted">Menus</p>
          <div className="space-y-2">
            {menuItems.map((item) => (
              <button
                className={
                  activeView === item.id
                    ? "w-full rounded-lg border border-transparent bg-[linear-gradient(120deg,#4cc9f0,#3b82f6)] px-3 py-2 text-left"
                    : "w-full rounded-lg border border-border bg-[#0f1728] px-3 py-2 text-left hover:border-accent"
                }
                key={item.id}
                onClick={() => setActiveView(item.id)}
                type="button"
              >
                <p className={activeView === item.id ? "font-semibold text-[#041022]" : "font-semibold"}>{item.label}</p>
                <p className={activeView === item.id ? "text-xs text-[#0e2840]" : "text-xs text-muted"}>{item.helper}</p>
              </button>
            ))}
          </div>
        </aside>

        <div>
          {activeView === "create" ? (
            <article className="panel space-y-5">
              <section>
                <h2 className="text-lg font-semibold">Create Tournament</h2>
                <div className="mt-3 space-y-2">
                  <input className="input" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Tournament name" />
                  <textarea
                    className="input min-h-24"
                    value={createDescription}
                    onChange={(event) => setCreateDescription(event.target.value)}
                    placeholder="Description"
                  />
                  <select
                    className="input"
                    value={String(createTeamLimit)}
                    onChange={(event) => setCreateTeamLimit(Number(event.target.value) as 4 | 8 | 16)}
                  >
                    <option value="4">4 Teams</option>
                    <option value="8">8 Teams</option>
                    <option value="16">16 Teams</option>
                  </select>
                </div>
                <button
                  className="btn btn-primary mt-3"
                  disabled={loading}
                  onClick={() =>
                    runAction(async () => {
                      const created = await callApi<{ tournament: { id: string } }>("/api/tournaments", {
                        method: "POST",
                        body: JSON.stringify({
                          name: createName,
                          description: createDescription,
                          teamLimit: createTeamLimit
                        })
                      });
                      setRulesetTournamentId(created.tournament.id);
                      setRegistrationTournamentId(created.tournament.id);
                      setGenerateTournamentId(created.tournament.id);
                      setFeedback("Tournament created. Configure game + mode below.");
                    })
                  }
                  type="button"
                >
                  Create
                </button>
              </section>

              <section className="border-t border-border/70 pt-5">
                <h3 className="text-base font-semibold">Game + Mode</h3>
                <div className="mt-3 grid gap-2">
                  <select className="input" value={rulesetTournamentId} onChange={(event) => setRulesetTournamentId(event.target.value)}>
                    <option value="">Select tournament</option>
                    {tournaments.map((tournament) => (
                      <option key={tournament.id} value={tournament.id}>
                        {tournament.name}
                      </option>
                    ))}
                  </select>

                  <select className="input" value={rulesetGameId} onChange={(event) => setRulesetGameId(event.target.value)}>
                    <option value="">Select game</option>
                    {games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>

                  <select className="input" value={rulesetModeId} onChange={(event) => setRulesetModeId(event.target.value)}>
                    <option value="">Select mode</option>
                    {selectedGame?.modes.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.label}
                      </option>
                    ))}
                  </select>

                  <select className="input" value={poolStrategy} onChange={(event) => setPoolStrategy(event.target.value as "RANDOM" | "MANUAL")}>
                    {randomPoolAllowed ? <option value="RANDOM">Random pool</option> : null}
                    <option value="MANUAL">Manual pool</option>
                  </select>

                  {!randomPoolAllowed ? (
                    <p className="rounded-lg border border-border/70 bg-[#0f1728] p-3 text-xs text-muted">
                      This game supports manual pool only.
                    </p>
                  ) : null}

                  {poolStrategy === "RANDOM" ? (
                    <p className="rounded-lg border border-border/70 bg-[#0f1728] p-3 text-xs text-muted">
                      Random pool size is set automatically based on tournament slots (4/8/16 teams).
                    </p>
                  ) : (
                    <div className="rounded-lg border border-border/70 bg-[#0f1728] p-3">
                      <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted">
                        {selectedGame?.contextLabelPlural ?? "Pool items"}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {selectedGame?.contextItems.map((contextItem) => (
                          <label className="flex items-center gap-2 text-sm" key={contextItem.id}>
                            <input
                              checked={manualContextItemIds.includes(contextItem.id)}
                              onChange={() => toggleManualPoolItem(contextItem.id)}
                              type="checkbox"
                            />
                            <span>{contextItem.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-primary mt-3"
                  disabled={loading || !rulesetTournamentId || !rulesetGameId || !rulesetModeId}
                  onClick={() =>
                    runAction(async () => {
                      const poolItems = poolStrategy === "MANUAL" ? manualContextItemIds.map((contextItemId) => ({ contextItemId })) : [];
                      await callApi(`/api/tournaments/${rulesetTournamentId}/ruleset`, {
                        method: "POST",
                        body: JSON.stringify({
                          gameId: rulesetGameId,
                          modeId: rulesetModeId,
                          poolStrategy,
                          poolItems
                        })
                      });
                      setFeedback("Ruleset saved and registration opened.");
                    })
                  }
                  type="button"
                >
                  Save Game + Mode
                </button>
              </section>
            </article>
          ) : null}

          {activeView === "registration" ? (
            <article className="panel">
              <h2 className="text-lg font-semibold">Team Registration</h2>
              <div className="mt-3 grid gap-2">
                <select className="input" value={registrationTournamentId} onChange={(event) => setRegistrationTournamentId(event.target.value)}>
                  <option value="">Select tournament</option>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.name}
                    </option>
                  ))}
                </select>

                <input className="input" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" />
                <input className="input" value={teamTag} onChange={(event) => setTeamTag(event.target.value)} placeholder="Tag (optional)" />

                <p className="text-xs text-muted">Players ({expectedTeamSize})</p>
                {playerNames.map((value, index) => (
                  <input
                    className="input"
                    key={index}
                    onChange={(event) =>
                      setPlayerNames((current) => current.map((name, playerIndex) => (playerIndex === index ? event.target.value : name)))
                    }
                    placeholder={`Player ${index + 1}`}
                    value={value}
                  />
                ))}
              </div>
              <button
                className="btn btn-primary mt-3"
                disabled={loading || !registrationTournamentId}
                onClick={() =>
                  runAction(async () => {
                    const normalizedPlayerNames = playerNames.map((name) => name.trim()).filter(Boolean);
                    if (normalizedPlayerNames.length !== expectedTeamSize) {
                      throw new Error(`Please fill exactly ${expectedTeamSize} player names.`);
                    }

                    await callApi(`/api/tournaments/${registrationTournamentId}/register`, {
                      method: "POST",
                      body: JSON.stringify({
                        teamName,
                        teamTag,
                        playerNames: normalizedPlayerNames
                      })
                    });
                    setFeedback("Team registered.");
                  })
                }
                type="button"
              >
                Register Team
              </button>
            </article>
          ) : null}

          {activeView === "bracket" ? (
            <article className="panel">
              <h2 className="text-lg font-semibold">Reports</h2>
              <div className="mt-3 grid gap-2">
                <label className="text-sm text-muted">Tournament for reports</label>
                <select className="input" value={generateTournamentId} onChange={(event) => setGenerateTournamentId(event.target.value)}>
                  <option value="">Select tournament</option>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.name}
                    </option>
                  ))}
                </select>
                <hr className="my-1 border-border" />
                <label className="text-sm text-muted">Submit match report</label>
                <select className="input" value={reportMatchId} onChange={(event) => setReportMatchId(event.target.value)}>
                  <option value="">Select ready match</option>
                  {reportableMatches.map((match) => (
                    <option key={match.id} value={match.id}>
                      R{match.round} M{match.position}: {match.participantATeam?.name ?? "TBD"} vs{" "}
                      {match.participantBTeam?.name ?? "TBD"}
                    </option>
                  ))}
                </select>
                <select className="input" value={reportWinnerTeamId} onChange={(event) => setReportWinnerTeamId(event.target.value)}>
                  <option value="">Select winner</option>
                  {selectedReportingMatch?.participantATeam ? (
                    <option value={selectedReportingMatch.participantATeam.id}>{selectedReportingMatch.participantATeam.name}</option>
                  ) : null}
                  {selectedReportingMatch?.participantBTeam ? (
                    <option value={selectedReportingMatch.participantBTeam.id}>{selectedReportingMatch.participantBTeam.name}</option>
                  ) : null}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={scoreA}
                    onChange={(event) => setScoreA(Number(event.target.value) || 0)}
                    placeholder="Score A"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={scoreB}
                    onChange={(event) => setScoreB(Number(event.target.value) || 0)}
                    placeholder="Score B"
                  />
                </div>
                <input className="input" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="Proof image URL" />
                <button
                  className="btn"
                  disabled={loading || !reportMatchId || !reportWinnerTeamId || !proofUrl}
                  onClick={() =>
                    runAction(async () => {
                      await callApi(`/api/matches/${reportMatchId}/report`, {
                        method: "POST",
                        body: JSON.stringify({
                          winnerTeamId: reportWinnerTeamId,
                          scoreA,
                          scoreB,
                          proofs: [{ publicUrl: proofUrl, storageProvider: "manual", objectKey: proofUrl }]
                        })
                      });
                      setFeedback("Match report submitted.");
                    })
                  }
                  type="button"
                >
                  Submit Report
                </button>

                <hr className="my-1 border-border" />
                <label className="text-sm text-muted">Admin review report</label>
                <select className="input" value={reviewReportId} onChange={(event) => setReviewReportId(event.target.value)}>
                  <option value="">Select pending report</option>
                  {pendingReports.map((report) => (
                    <option key={report.id} value={report.id}>
                      R{report.matchRound} M{report.matchPosition}: {report.matchLabel}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={approveReport ? "approve" : "reject"}
                  onChange={(event) => setApproveReport(event.target.value === "approve")}
                >
                  <option value="approve">Approve</option>
                  <option value="reject">Reject</option>
                </select>
                <input
                  className="input"
                  value={decisionNote}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  placeholder="Decision note"
                />
                <button
                  className="btn"
                  disabled={loading || !reviewReportId}
                  onClick={() =>
                    runAction(async () => {
                      await callApi(`/api/reports/${reviewReportId}/approve`, {
                        method: "POST",
                        body: JSON.stringify({
                          approve: approveReport,
                          decisionNote
                        })
                      });
                      setFeedback(`Report ${approveReport ? "approved" : "rejected"}.`);
                    })
                  }
                  type="button"
                >
                  Submit Review
                </button>
                {pendingReports.find((report) => report.id === reviewReportId) ? (
                  <div className="rounded border border-border/60 bg-[#101828] p-2 text-xs text-muted">
                    {(() => {
                      const report = pendingReports.find((item) => item.id === reviewReportId);
                      if (!report) {
                        return null;
                      }
                      return (
                        <>
                          <p>
                            Selected: {report.matchLabel} (R{report.matchRound} M{report.matchPosition})
                          </p>
                          <p>
                            Score: {report.scoreA} - {report.scoreB}
                          </p>
                          <p className="truncate">Proof: {report.proofAssets[0]?.publicUrl ?? "No proof url"}</p>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            </article>
          ) : null}

          {activeView === "tournaments" ? (
            <section className="panel">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Tournaments</h2>
                <button className="btn" onClick={() => void runAction(async () => Promise.resolve())} type="button">
                  Refresh
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="py-2">Name</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Game</th>
                      <th className="py-2">Mode</th>
                      <th className="py-2">Teams</th>
                      <th className="py-2">Open</th>
                      <th className="py-2">Bracket</th>
                      <th className="py-2 text-right">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournaments.map((tournament) => (
                      <tr className="border-b border-border/60" key={tournament.id}>
                        <td className="py-2">{tournament.name}</td>
                        <td className="py-2">{tournament.status}</td>
                        <td className="py-2">{tournament.ruleset?.game.name ?? "-"}</td>
                        <td className="py-2">{tournament.ruleset?.mode.label ?? "-"}</td>
                        <td className="py-2">
                          {tournament._count.registrations}/{tournament.teamLimit}
                        </td>
                        <td className="py-2">
                          <Link className="btn" href={`/tournaments/${tournament.id}`}>
                            View
                          </Link>
                        </td>
                        <td className="py-2">
                          <button
                            className="btn"
                            disabled={loading}
                            onClick={() =>
                              runAction(async () => {
                                await callApi(`/api/tournaments/${tournament.id}/generate-bracket`, {
                                  method: "POST",
                                  body: JSON.stringify({})
                                });
                                setGenerateTournamentId(tournament.id);
                                setFeedback(`Bracket generated for ${tournament.name}.`);
                              })
                            }
                            type="button"
                          >
                            Generate
                          </button>
                        </td>
                        <td className="py-2 text-right">
                          <button
                            aria-label={`Delete ${tournament.name}`}
                            className="btn"
                            disabled={loading}
                            onClick={() =>
                              runAction(async () => {
                                const confirmed = window.confirm(`Delete tournament "${tournament.name}"?`);
                                if (!confirmed) {
                                  return;
                                }
                                await callApi(`/api/tournaments/${tournament.id}`, { method: "DELETE" });
                                setFeedback("Tournament deleted.");
                              })
                            }
                            title={`Delete ${tournament.name}`}
                            type="button"
                          >
                            <svg fill="none" height="16" viewBox="0 0 24 24" width="16">
                              <path
                                d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 7M10 11v6M14 11v6"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.7"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
