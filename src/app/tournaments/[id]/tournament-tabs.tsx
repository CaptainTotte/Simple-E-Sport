"use client";

import { useMemo, useState } from "react";

type MatchItem = {
  id: string;
  round: number;
  position: number;
  status: string;
  participantATeamName: string | null;
  participantBTeamName: string | null;
  winnerTeamName: string | null;
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

function outcomeForTeam(match: MatchItem, teamName: string): TeamOutcome {
  if (!match.winnerTeamName || teamName === "TBD") {
    return "-";
  }
  return match.winnerTeamName === teamName ? "W" : "L";
}

function participantRowClass(outcome: TeamOutcome) {
  if (outcome === "W") {
    return "bg-[linear-gradient(90deg,rgba(34,197,94,0.2),rgba(34,197,94,0.05))] text-white";
  }
  if (outcome === "L") {
    return "bg-[linear-gradient(90deg,rgba(239,68,68,0.18),rgba(239,68,68,0.04))] text-white";
  }
  return "text-[#d8deef]";
}

function stripClass(outcome: TeamOutcome) {
  if (outcome === "W") {
    return "bg-[#22c55e]";
  }
  if (outcome === "L") {
    return "bg-[#ef4444]";
  }
  return "bg-[#44d9ff]";
}

export default function TournamentTabs({ matches, ruleset, teams }: TournamentTabsProps) {
  const [activeTab, setActiveTab] = useState<"bracket" | "rules" | "teams">("bracket");

  const rounds = useMemo(() => {
    const grouped = new Map<number, MatchItem[]>();
    for (const match of matches) {
      const current = grouped.get(match.round) ?? [];
      current.push(match);
      grouped.set(match.round, current);
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  return (
    <section className="panel mt-4">
      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
        <button className={`btn ${activeTab === "bracket" ? "btn-primary" : ""}`} onClick={() => setActiveTab("bracket")} type="button">
          Bracket
        </button>
        <button className={`btn ${activeTab === "rules" ? "btn-primary" : ""}`} onClick={() => setActiveTab("rules")} type="button">
          Regler
        </button>
        <button className={`btn ${activeTab === "teams" ? "btn-primary" : ""}`} onClick={() => setActiveTab("teams")} type="button">
          Lag & Spelare
        </button>
      </div>

      {activeTab === "bracket" ? (
        <>
          {matches.length === 0 ? (
            <p className="text-sm text-muted">Bracket is not generated yet.</p>
          ) : (
            <div className="overflow-x-auto py-1">
              {(() => {
                const firstRoundMatches = rounds[0]?.[1].length ?? 0;
                const isLargeBracket = firstRoundMatches >= 8;
                const cardHeight = isLargeBracket ? 72 : BRACKET_CARD_HEIGHT_DEFAULT;
                const step = isLargeBracket ? 94 : BRACKET_STEP_DEFAULT;
                const baseHeight =
                  firstRoundMatches > 0
                    ? (firstRoundMatches - 1) * step + cardHeight
                    : cardHeight;
                const bracketHeight = baseHeight;

                return (
                  <div className="min-w-max px-1">
                    <div className="relative" style={{ height: bracketHeight }}>
                      <div className="flex" style={{ gap: BRACKET_COLUMN_GAP }}>
                        {rounds.map(([round, roundMatches], roundIndex) => {
                          const offset = ((Math.pow(2, roundIndex) - 1) * step) / 2;
                          const spacing = step * Math.pow(2, roundIndex);

                          return (
                            <div
                              className="relative shrink-0 overflow-visible"
                              key={round}
                              style={{ width: BRACKET_COLUMN_WIDTH, height: bracketHeight }}
                            >
                              {roundMatches.map((match, matchIndex) => {
                                const top = offset + matchIndex * spacing;
                                const teamA = teamLabel(match.participantATeamName);
                                const teamB = teamLabel(match.participantBTeamName);
                                const outcomeA = outcomeForTeam(match, teamA);
                                const outcomeB = outcomeForTeam(match, teamB);

                                return (
                                  <article
                                    className="absolute overflow-hidden rounded-md border border-[#1d2a45] bg-[#0b1230] shadow-[0_14px_28px_rgba(0,0,0,0.28)]"
                                    key={match.id}
                                    style={{ top, height: cardHeight, width: BRACKET_COLUMN_WIDTH }}
                                  >
                                    <div
                                      className={`absolute right-0 top-0 h-1/2 w-2 ${stripClass(outcomeA)}`}
                                    />
                                    <div
                                      className={`absolute right-0 bottom-0 h-1/2 w-2 ${stripClass(outcomeB)}`}
                                    />

                                    <div className={`flex h-1/2 items-center justify-between border-b border-[#1d2740] px-3 text-sm ${participantRowClass(outcomeA)}`}>
                                      <span className="max-w-[220px] truncate font-semibold">{teamA}</span>
                                      <span className="text-[11px] uppercase tracking-[0.08em] text-[#8ea2c7]">
                                        {outcomeA}
                                      </span>
                                    </div>
                                    <div className={`flex h-1/2 items-center justify-between px-3 text-sm ${participantRowClass(outcomeB)}`}>
                                      <span className="max-w-[220px] truncate font-semibold">{teamB}</span>
                                      <span className="text-[11px] uppercase tracking-[0.08em] text-[#8ea2c7]">
                                        {outcomeB}
                                      </span>
                                    </div>
                                  </article>
                                );
                              })}

                              {roundIndex < rounds.length - 1
                                ? Array.from({ length: Math.floor(roundMatches.length / 2) }, (_, pairIndex) => {
                                    const topCenter =
                                      offset +
                                      pairIndex * 2 * spacing +
                                      cardHeight / 2;
                                    const bottomCenter = topCenter + spacing;
                                    const connectorHeight = bottomCenter - topCenter;
                                    const midX = 20;

                                    return (
                                      <svg
                                        aria-hidden="true"
                                        className="absolute pointer-events-none overflow-visible"
                                        key={`connector-${round}-${pairIndex}`}
                                        style={{
                                          left: BRACKET_COLUMN_WIDTH,
                                          top: topCenter,
                                          width: BRACKET_CONNECTOR_WIDTH,
                                          height: connectorHeight
                                        }}
                                        viewBox={`0 0 ${BRACKET_CONNECTOR_WIDTH} ${connectorHeight}`}
                                      >
                                        <line stroke="#bcc8de" strokeWidth="2" x1="0" x2={midX} y1="0" y2="0" />
                                        <line
                                          stroke="#bcc8de"
                                          strokeWidth="2"
                                          x1="0"
                                          x2={midX}
                                          y1={connectorHeight}
                                          y2={connectorHeight}
                                        />
                                        <line
                                          stroke="#bcc8de"
                                          strokeWidth="2"
                                          x1={midX}
                                          x2={midX}
                                          y1="0"
                                          y2={connectorHeight}
                                        />
                                        <line
                                          stroke="#bcc8de"
                                          strokeWidth="2"
                                          x1={midX}
                                          x2={BRACKET_CONNECTOR_WIDTH}
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
                );
              })()}
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
              <div className="rounded-lg border border-border/70 bg-[#141821] p-4 text-sm">
                <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted">Regler</p>
                <p className="whitespace-pre-line text-[#d7deef]">
                  {ruleset.rulesText?.trim() ? ruleset.rulesText : "Inga specifika regler har lagts till ännu."}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-[#141821] p-4 text-sm">
                <p>Game: {ruleset.gameName}</p>
                <p>Mode: {ruleset.modeLabel}</p>
                <p>Lagstorlek: {ruleset.teamSize}</p>
                <p>Turneringsplatser: {ruleset.teamLimit}</p>
                <p>Pool strategy: {ruleset.poolStrategy}</p>
                {ruleset.poolStrategy === "RANDOM" ? (
                  <p>Random pool size: {ruleset.randomPoolSize ?? "-"}</p>
                ) : (
                  <p>Pool: {ruleset.poolLabels.length > 0 ? ruleset.poolLabels.join(", ") : "No manual pool entries"}</p>
                )}
              </div>
            </div>
          )}
        </>
      ) : null}

      {activeTab === "teams" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {teams.length === 0 ? (
            <p className="text-sm text-muted">No registered teams yet.</p>
          ) : (
            teams.map((team) => (
              <article className="rounded-lg border border-border/70 bg-[#141821] p-3" key={team.id}>
                <h3 className="font-semibold">
                  {team.name} {team.tag ? <span className="text-muted">[{team.tag}]</span> : null}
                </h3>
                <p className="text-xs text-muted">Registration: {team.status}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {team.members.map((member) => (
                    <li key={member.id}>
                      {member.name} <span className="text-xs text-muted">({member.role})</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
