"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { showToast } from "@/lib/toast";

type MatchItem = {
  id: string;
  round: number;
  position: number;
  status: string;
  participantATeamId: string | null;
  participantBTeamId: string | null;
  participantATeamName: string | null;
  participantBTeamName: string | null;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  scoreA: number | null;
  scoreB: number | null;
  latestReportId: string | null;
  latestReportStatus: string | null;
  latestProofUrl: string | null;
};

type TeamItem = {
  id: string;
  name: string;
  tag: string | null;
  status: string;
  members: Array<{
    id: string;
    name: string;
    username: string | null;
    role: string;
  }>;
};

type RulesetData = {
  gameName: string;
  modeLabel: string;
  teamSize: number;
  teamLimit: number;
  rulesText: string | null;
  poolStrategy: string;
  randomPoolSize: number | null;
  poolLabels: string[];
};

type TournamentTabsProps = {
  matches: MatchItem[];
  ruleset: RulesetData | null;
  teams: TeamItem[];
  tournamentId: string;
  tournamentStatus: string;
  requiredTeamSize: number | null;
  registeredCount: number;
  teamLimit: number;
  viewerRole: string | null;
  viewerTeam: {
    id: string;
    name: string;
    memberCount: number;
    myRole: string;
    alreadyRegistered: boolean;
  } | null;
};

type TournamentApiResponse = {
  tournament: {
    registrations: Array<{
      status: string;
      team: {
        id: string;
        name: string;
        tag: string | null;
        members: Array<{
          id: string;
          role: string;
          displayName: string | null;
          user: {
            name: string;
            username: string | null;
          } | null;
        }>;
      };
    }>;
    bracket: {
      matches: Array<{
        id: string;
        round: number;
        position: number;
        status: string;
        participantATeam: {
          id: string;
          name: string;
        } | null;
        participantBTeam: {
          id: string;
          name: string;
        } | null;
        winnerTeam: {
          id: string;
          name: string;
        } | null;
        scoreA: number | null;
        scoreB: number | null;
        reports: Array<{
          id: string;
          status: string;
          proofAssets: Array<{
            publicUrl: string;
          }>;
        }>;
      }>;
    } | null;
  };
};

function teamLabel(name: string | null | undefined) {
  return name ?? "TBD";
}

const BRACKET_CARD_HEIGHT_DEFAULT = 84;
const BRACKET_STEP_DEFAULT = 112;
const BRACKET_COLUMN_WIDTH = 280;
const BRACKET_COLUMN_GAP = 120;
const BRACKET_CONNECTOR_WIDTH = BRACKET_COLUMN_GAP;

type TeamOutcome = "W" | "L" | "-";

function outcomeForSlot(match: MatchItem, slot: "A" | "B"): TeamOutcome {
  const teamId = slot === "A" ? match.participantATeamId : match.participantBTeamId;
  if (!match.winnerTeamId || !teamId) {
    return "-";
  }
  return match.winnerTeamId === teamId ? "W" : "L";
}

function participantRowClass(outcome: TeamOutcome) {
  if (outcome === "W") {
    return "bg-[linear-gradient(90deg,rgba(34,197,94,0.2),rgba(34,197,94,0.05))] text-white";
  }
  if (outcome === "L") {
    return "bg-[linear-gradient(90deg,rgba(239,68,68,0.18),rgba(239,68,68,0.04))] text-white";
  }
  return "text-[#E5E7EB]";
}

function stripClass(outcome: TeamOutcome) {
  if (outcome === "W") {
    return "bg-[#22c55e]";
  }
  if (outcome === "L") {
    return "bg-[#ef4444]";
  }
  return "bg-[#6D5DFC]";
}

function mapMatchesFromTournament(tournament: TournamentApiResponse["tournament"]): MatchItem[] {
  return (
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
    })) ?? []
  );
}

function mapTeamsFromTournament(tournament: TournamentApiResponse["tournament"]): TeamItem[] {
  return tournament.registrations.map((registration) => ({
    id: registration.team.id,
    name: registration.team.name,
    tag: registration.team.tag,
    status: registration.status,
    members: registration.team.members.map((member) => ({
      id: member.id,
      name: member.user?.name ?? member.displayName ?? "Unnamed",
      username: member.user?.username ?? null,
      role: member.role
    }))
  }));
}

export default function TournamentTabs({
  matches,
  ruleset,
  teams,
  tournamentId,
  tournamentStatus,
  requiredTeamSize,
  registeredCount,
  teamLimit,
  viewerRole,
  viewerTeam
}: TournamentTabsProps) {
  const router = useRouter();
  const isAdmin = viewerRole === "PLATFORM_ADMIN" || viewerRole === "TOURNAMENT_ADMIN";
  const [activeTab, setActiveTab] = useState<"bracket" | "rules" | "teams">("bracket");
  const [signupLoading, setSignupLoading] = useState(false);
  const [liveMatches, setLiveMatches] = useState<MatchItem[]>(matches);
  const [liveTeams, setLiveTeams] = useState<TeamItem[]>(teams);
  const [liveRegisteredCount, setLiveRegisteredCount] = useState(registeredCount);
  const [matchDialog, setMatchDialog] = useState<{
    matchId: string;
    status: string;
    teamAId: string;
    teamBId: string;
    teamAName: string;
    teamBName: string;
    winnerTeamId: string;
    scoreA: number;
    scoreB: number;
  } | null>(null);
  const [resultSubmitting, setResultSubmitting] = useState(false);
  const bracketViewportRef = useRef<HTMLDivElement | null>(null);
  const [bracketViewportWidth, setBracketViewportWidth] = useState(0);

  const rounds = useMemo(() => {
    const grouped = new Map<number, MatchItem[]>();
    for (const match of liveMatches) {
      const current = grouped.get(match.round) ?? [];
      current.push(match);
      grouped.set(match.round, current);
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [liveMatches]);

  const visibleRounds = rounds;

  const bracketLayout = useMemo(() => {
    const firstVisibleRoundMatches = visibleRounds[0]?.[1].length ?? 0;
    const isVeryLargeBracket = firstVisibleRoundMatches >= 8;
    const isLargeBracket = firstVisibleRoundMatches >= 4;

    const cardHeight = isVeryLargeBracket ? 72 : BRACKET_CARD_HEIGHT_DEFAULT;
    const step = isVeryLargeBracket ? 94 : BRACKET_STEP_DEFAULT;
    const columnWidth = isVeryLargeBracket ? 240 : isLargeBracket ? 260 : BRACKET_COLUMN_WIDTH;
    const columnGap = isVeryLargeBracket ? 88 : BRACKET_COLUMN_GAP;
    const connectorWidth = columnGap;

    const bracketHeight =
      firstVisibleRoundMatches > 0
        ? (firstVisibleRoundMatches - 1) * step + cardHeight
        : cardHeight;
    const bracketWidth =
      visibleRounds.length > 0
        ? visibleRounds.length * columnWidth + (visibleRounds.length - 1) * columnGap
        : columnWidth;

    return {
      cardHeight,
      step,
      columnWidth,
      columnGap,
      connectorWidth,
      bracketHeight,
      bracketWidth
    };
  }, [visibleRounds]);

  const bracketScale = useMemo(() => {
    if (bracketViewportWidth <= 0 || bracketLayout.bracketWidth <= 0) {
      return 1;
    }
    return Math.min(1, bracketViewportWidth / bracketLayout.bracketWidth);
  }, [bracketLayout.bracketWidth, bracketViewportWidth]);

  useEffect(() => {
    setLiveMatches(matches);
  }, [matches]);

  useEffect(() => {
    setLiveTeams(teams);
  }, [teams]);

  useEffect(() => {
    setLiveRegisteredCount(registeredCount);
  }, [registeredCount]);

  useEffect(() => {
    let disposed = false;
    async function refreshLiveTournament() {
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}`, {
          cache: "no-store",
          credentials: "same-origin"
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as TournamentApiResponse;
        if (disposed || !payload?.tournament) {
          return;
        }
        setLiveMatches(mapMatchesFromTournament(payload.tournament));
        setLiveTeams(mapTeamsFromTournament(payload.tournament));
        setLiveRegisteredCount(payload.tournament.registrations.length);
      } catch {
        // Silent polling errors; user can continue interacting.
      }
    }

    void refreshLiveTournament();
    const intervalId = window.setInterval(() => {
      void refreshLiveTournament();
    }, 4000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [tournamentId]);

  useEffect(() => {
    const target = bracketViewportRef.current;
    if (!target || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setBracketViewportWidth(nextWidth);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const signupState = useMemo(() => {
    if (!viewerRole) {
      return {
        enabled: false,
        reason: "Log in to sign up."
      };
    }

    if (tournamentStatus !== "REGISTRATION_OPEN") {
      return {
        enabled: false,
        reason: "Registration is closed."
      };
    }

    if (!requiredTeamSize) {
      return {
        enabled: false,
        reason: "Tournament mode is not configured."
      };
    }

    if (!viewerTeam) {
      return {
        enabled: false,
        reason: "Du behöver ett team."
      };
    }

    if (viewerTeam.alreadyRegistered) {
      return {
        enabled: false,
        reason: "Your team is already registered."
      };
    }

    if (liveRegisteredCount >= teamLimit) {
      return {
        enabled: false,
        reason: "Tournament is full."
      };
    }

    if (viewerTeam.memberCount !== requiredTeamSize) {
      if (viewerTeam.memberCount < requiredTeamSize) {
        return {
          enabled: false,
          reason: "Ditt team har inte tillräckligt med spelare för denna turnering."
        };
      }
      return {
        enabled: false,
        reason: `Ditt team måste ha exakt ${requiredTeamSize} spelare för denna turnering.`
      };
    }

    if (!isAdmin && viewerTeam.myRole !== "CAPTAIN") {
      return {
        enabled: false,
        reason: "Only team captain can sign up."
      };
    }

    return {
      enabled: true,
      reason: ""
    };
  }, [isAdmin, liveRegisteredCount, requiredTeamSize, teamLimit, tournamentStatus, viewerRole, viewerTeam]);

  async function submitSignup() {
    if (!signupState.enabled) {
      showToast(signupState.reason, "error");
      return;
    }
    if (!viewerTeam) {
      showToast("Create or join a team first.", "error");
      return;
    }

    setSignupLoading(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          teamId: viewerTeam.id
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not sign up team.");
      }

      showToast("Team signat till turneringen.", "success");
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not sign up team.", "error");
    } finally {
      setSignupLoading(false);
    }
  }

  function openAdminMatchDialog(match: MatchItem) {
    const canEdit = match.status === "READY" || match.status === "REPORTED" || match.status === "FINALIZED";
    if (!isAdmin || !canEdit || !match.participantATeamId || !match.participantBTeamId) {
      return;
    }
    setMatchDialog({
      matchId: match.id,
      status: match.status,
      teamAId: match.participantATeamId,
      teamBId: match.participantBTeamId,
      teamAName: teamLabel(match.participantATeamName),
      teamBName: teamLabel(match.participantBTeamName),
      winnerTeamId: match.winnerTeamId ?? match.participantATeamId,
      scoreA: match.scoreA ?? 2,
      scoreB: match.scoreB ?? 0
    });
  }

  async function submitAdminResult() {
    if (!matchDialog) {
      return;
    }
    setResultSubmitting(true);
    try {
      const response = await fetch(`/api/matches/${matchDialog.matchId}/result`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          winnerTeamId: matchDialog.winnerTeamId,
          scoreA: matchDialog.scoreA,
          scoreB: matchDialog.scoreB
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not submit result.");
      }

      const tournamentResponse = await fetch(`/api/tournaments/${tournamentId}`, {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (tournamentResponse.ok) {
        const tournamentPayload = (await tournamentResponse.json()) as TournamentApiResponse;
        setLiveMatches(mapMatchesFromTournament(tournamentPayload.tournament));
        setLiveTeams(mapTeamsFromTournament(tournamentPayload.tournament));
        setLiveRegisteredCount(tournamentPayload.tournament.registrations.length);
      }

      showToast(matchDialog.status === "FINALIZED" ? "Result updated." : "Result submitted and bracket updated.", "success");
      setMatchDialog(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not submit result.", "error");
    } finally {
      setResultSubmitting(false);
    }
  }

  return (
    <section className="panel mt-4">
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button className={`btn ${activeTab === "bracket" ? "btn-primary" : ""}`} onClick={() => setActiveTab("bracket")} type="button">
          Bracket
        </button>
        <button className={`btn ${activeTab === "rules" ? "btn-primary" : ""}`} onClick={() => setActiveTab("rules")} type="button">
          Regler
        </button>
        <button className={`btn ${activeTab === "teams" ? "btn-primary" : ""}`} onClick={() => setActiveTab("teams")} type="button">
          Lag & Spelare
        </button>
        <button
          className="btn btn-primary ml-auto"
          disabled={signupLoading}
          onClick={() => void submitSignup()}
          title={signupState.enabled ? "Sign up your team" : signupState.reason}
          type="button"
        >
          {signupLoading ? "Signing up..." : "Signup"}
        </button>
      </div>

      {activeTab === "bracket" ? (
        <>
          {liveMatches.length === 0 ? (
            <p className="text-sm text-muted">Bracket is not generated yet.</p>
          ) : (
            <div className="py-1">
              <div className="w-full overflow-hidden" ref={bracketViewportRef}>
                <div
                  className="mx-auto"
                  style={{
                    width: bracketLayout.bracketWidth * bracketScale,
                    height: bracketLayout.bracketHeight * bracketScale
                  }}
                >
                  <div
                    className="relative"
                    style={{
                      width: bracketLayout.bracketWidth,
                      height: bracketLayout.bracketHeight,
                      transform: `scale(${bracketScale})`,
                      transformOrigin: "top left"
                    }}
                  >
                    <div className="flex" style={{ gap: bracketLayout.columnGap }}>
                      {visibleRounds.map(([round, roundMatches], roundIndex) => {
                        const offset = ((Math.pow(2, roundIndex) - 1) * bracketLayout.step) / 2;
                        const spacing = bracketLayout.step * Math.pow(2, roundIndex);

                        return (
                          <div
                            className="relative shrink-0 overflow-visible"
                            key={round}
                            style={{ width: bracketLayout.columnWidth, height: bracketLayout.bracketHeight }}
                          >
                            {roundMatches.map((match, matchIndex) => {
                              const top = offset + matchIndex * spacing;
                              const teamA = teamLabel(match.participantATeamName);
                              const teamB = teamLabel(match.participantBTeamName);
                              const outcomeA = outcomeForSlot(match, "A");
                              const outcomeB = outcomeForSlot(match, "B");
                              const canAdminReport =
                                isAdmin &&
                                (match.status === "READY" || match.status === "REPORTED" || match.status === "FINALIZED") &&
                                Boolean(match.participantATeamId) &&
                                Boolean(match.participantBTeamId);

                              return (
                                <article
                                  className={`absolute overflow-hidden rounded-md border border-[#2A2F36] bg-[#181A1F] shadow-[0_14px_28px_rgba(0,0,0,0.28)] ${
                                    canAdminReport ? "cursor-pointer transition-colors hover:border-[#6D5DFC] hover:bg-[#202329]" : ""
                                  }`}
                                  key={match.id}
                                  onClick={() => openAdminMatchDialog(match)}
                                  style={{ top, height: bracketLayout.cardHeight, width: bracketLayout.columnWidth }}
                                  title={canAdminReport ? "Click to set or edit result" : undefined}
                                >
                                  <div className={`absolute right-0 top-0 h-1/2 w-2 ${stripClass(outcomeA)}`} />
                                  <div className={`absolute right-0 bottom-0 h-1/2 w-2 ${stripClass(outcomeB)}`} />

                                  <div
                                    className={`flex h-1/2 items-center justify-between border-b border-[#2A2F36] px-3 text-sm ${participantRowClass(outcomeA)}`}
                                  >
                                    <span className="max-w-[220px] truncate font-semibold">{teamA}</span>
                                    <span className="text-[11px] uppercase tracking-[0.08em] text-[#A1A1AA]">{outcomeA}</span>
                                  </div>
                                  <div className={`flex h-1/2 items-center justify-between px-3 text-sm ${participantRowClass(outcomeB)}`}>
                                    <span className="max-w-[220px] truncate font-semibold">{teamB}</span>
                                    <span className="text-[11px] uppercase tracking-[0.08em] text-[#A1A1AA]">{outcomeB}</span>
                                  </div>
                                </article>
                              );
                            })}

                            {roundIndex < visibleRounds.length - 1
                              ? Array.from({ length: Math.floor(roundMatches.length / 2) }, (_, pairIndex) => {
                                  const topCenter = offset + pairIndex * 2 * spacing + bracketLayout.cardHeight / 2;
                                  const bottomCenter = topCenter + spacing;
                                  const connectorHeight = bottomCenter - topCenter;
                                  const midX = 20;

                                  return (
                                    <svg
                                      aria-hidden="true"
                                      className="absolute pointer-events-none overflow-visible"
                                      key={`connector-${round}-${pairIndex}`}
                                      style={{
                                        left: bracketLayout.columnWidth,
                                        top: topCenter,
                                        width: bracketLayout.connectorWidth,
                                        height: connectorHeight
                                      }}
                                      viewBox={`0 0 ${bracketLayout.connectorWidth} ${connectorHeight}`}
                                    >
                                      <line stroke="#A1A1AA" strokeWidth="2" x1="0" x2={midX} y1="0" y2="0" />
                                      <line stroke="#A1A1AA" strokeWidth="2" x1="0" x2={midX} y1={connectorHeight} y2={connectorHeight} />
                                      <line stroke="#A1A1AA" strokeWidth="2" x1={midX} x2={midX} y1="0" y2={connectorHeight} />
                                      <line
                                        stroke="#A1A1AA"
                                        strokeWidth="2"
                                        x1={midX}
                                        x2={bracketLayout.connectorWidth}
                                        y1={connectorHeight / 2}
                                        y2={connectorHeight / 2}
                                      />
                                    </svg>
                                  );
                                })
                              : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      {activeTab === "rules" ? (
        <>
          {!ruleset ? (
            <p className="text-sm text-muted">Rules are not configured yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/70 bg-[#181A1F] p-4 text-sm">
                <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted">Regler</p>
                <p className="whitespace-pre-line text-[#E5E7EB]">
                  {ruleset.rulesText?.trim() ? ruleset.rulesText : "Inga specifika regler har lagts till ännu."}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-[#181A1F] p-4 text-sm">
                <p>Game: {ruleset.gameName}</p>
                <p>Mode: {ruleset.modeLabel}</p>
                <p>Lagstorlek: {ruleset.teamSize}</p>
                <p>Turneringsplatser: {ruleset.teamLimit}</p>
                {ruleset.randomPoolSize === null && ruleset.poolLabels.length === 0 ? (
                  <p>Pool: None</p>
                ) : (
                  <>
                    <p>Pool strategy: {ruleset.poolStrategy}</p>
                    {ruleset.poolStrategy === "RANDOM" ? (
                      <p>Random pool size: {ruleset.randomPoolSize ?? "-"}</p>
                    ) : (
                      <p>Pool: {ruleset.poolLabels.length > 0 ? ruleset.poolLabels.join(", ") : "No manual pool entries"}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      ) : null}

      {activeTab === "teams" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {liveTeams.length === 0 ? (
            <p className="text-sm text-muted">No registered teams yet.</p>
          ) : (
            liveTeams.map((team) => (
              <article className="rounded-lg border border-border/70 bg-[#181A1F] p-3" key={team.id}>
                <h3 className="font-semibold">
                  {team.name} {team.tag ? <span className="text-muted">[{team.tag}]</span> : null}
                </h3>
                <p className="text-xs text-muted">Registration: {team.status}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {team.members.map((member) => (
                    <li key={member.id}>
                      {member.username ? (
                        <Link className="transition-colors hover:text-[#7C6EFF]" href={`/players/${member.username}`}>
                          {member.name}
                        </Link>
                      ) : (
                        member.name
                      )}{" "}
                      <span className="text-xs text-muted">({member.role})</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </div>
      ) : null}

      {matchDialog ? (
        <div className="dialog-overlay z-[320]" onClick={() => setMatchDialog(null)}>
          <article
            className="dialog-card w-full max-w-md p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">
                  {matchDialog.status === "FINALIZED" ? "Edit Match Result" : "Report Match"}
                </p>
                <p className="text-sm font-semibold">
                  {matchDialog.teamAName} vs {matchDialog.teamBName}
                </p>
              </div>
              <button className="btn" onClick={() => setMatchDialog(null)} type="button">
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`btn w-full ${matchDialog.winnerTeamId === matchDialog.teamAId ? "!border-[#22c55e] !bg-[#163023]" : ""}`}
                  onClick={() => setMatchDialog((current) => (current ? { ...current, winnerTeamId: current.teamAId } : current))}
                  type="button"
                >
                  Winner: {matchDialog.teamAName}
                </button>
                <button
                  className={`btn w-full ${matchDialog.winnerTeamId === matchDialog.teamBId ? "!border-[#22c55e] !bg-[#163023]" : ""}`}
                  onClick={() => setMatchDialog((current) => (current ? { ...current, winnerTeamId: current.teamBId } : current))}
                  type="button"
                >
                  Winner: {matchDialog.teamBName}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  min={0}
                  onChange={(event) =>
                    setMatchDialog((current) => (current ? { ...current, scoreA: Number(event.target.value) || 0 } : current))
                  }
                  type="number"
                  value={matchDialog.scoreA}
                />
                <input
                  className="input"
                  min={0}
                  onChange={(event) =>
                    setMatchDialog((current) => (current ? { ...current, scoreB: Number(event.target.value) || 0 } : current))
                  }
                  type="number"
                  value={matchDialog.scoreB}
                />
              </div>

              <button className="btn btn-primary w-full" disabled={resultSubmitting} onClick={() => void submitAdminResult()} type="button">
                {resultSubmitting ? "Saving..." : matchDialog.status === "FINALIZED" ? "Update Result" : "Submit Result"}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
