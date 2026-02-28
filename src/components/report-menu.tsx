"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DashboardMatch = {
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
};

type DashboardTournament = {
  id: string;
  name: string;
  matches: DashboardMatch[];
};

type DashboardData = {
  isAdmin: boolean;
  tournaments: DashboardTournament[];
};

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

export function ReportMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [tournamentId, setTournamentId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [winnerTeamId, setWinnerTeamId] = useState("");
  const [scoreA, setScoreA] = useState(2);
  const [scoreB, setScoreB] = useState(0);
  const [proofUrl, setProofUrl] = useState("");

  const [reviewReportId, setReviewReportId] = useState("");
  const [approveReport, setApproveReport] = useState(true);
  const [decisionNote, setDecisionNote] = useState("");

  const tournaments = dashboard?.tournaments ?? [];
  const isAdmin = dashboard?.isAdmin ?? false;

  const selectedTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === tournamentId) ?? null,
    [tournaments, tournamentId]
  );
  const selectedMatch = useMemo(
    () => selectedTournament?.matches.find((match) => match.id === matchId) ?? null,
    [selectedTournament, matchId]
  );

  const reportableMatches = useMemo(
    () =>
      (selectedTournament?.matches ?? []).filter((match) => {
        const hasPending = match.reports.some((report) => report.status === "SUBMITTED");
        return match.status === "READY" && !hasPending;
      }),
    [selectedTournament]
  );

  const pendingReports = useMemo(
    () =>
      tournaments.flatMap((tournament) =>
        tournament.matches.flatMap((match) =>
          match.reports
            .filter((report) => report.status === "SUBMITTED")
            .map((report) => ({
              ...report,
              tournamentName: tournament.name,
              matchRound: match.round,
              matchPosition: match.position,
              matchLabel: `${match.participantATeam?.name ?? "TBD"} vs ${match.participantBTeam?.name ?? "TBD"}`
            }))
        )
      ),
    [tournaments]
  );

  const selectedPendingReport = useMemo(
    () => pendingReports.find((report) => report.id === reviewReportId) ?? null,
    [pendingReports, reviewReportId]
  );

  async function loadDashboard() {
    const data = await callApi<DashboardData>("/api/reports/dashboard");
    setDashboard(data);
    setTournamentId((current) => current || data.tournaments[0]?.id || "");
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadDashboard().catch((error) => setFeedback(error.message));
  }, [open]);

  useEffect(() => {
    if (!selectedTournament) {
      setMatchId("");
      return;
    }
    if (!selectedTournament.matches.find((match) => match.id === matchId)) {
      setMatchId(reportableMatches[0]?.id ?? "");
    }
  }, [selectedTournament, matchId, reportableMatches]);

  useEffect(() => {
    if (!selectedMatch) {
      setWinnerTeamId("");
      return;
    }
    const allowedIds = [selectedMatch.participantATeam?.id, selectedMatch.participantBTeam?.id].filter(
      (teamId): teamId is string => Boolean(teamId)
    );
    setWinnerTeamId((current) => (allowedIds.includes(current) ? current : allowedIds[0] ?? ""));
  }, [selectedMatch]);

  useEffect(() => {
    if (!pendingReports.find((report) => report.id === reviewReportId)) {
      setReviewReportId(pendingReports[0]?.id ?? "");
    }
  }, [pendingReports, reviewReportId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current) {
        return;
      }
      const target = event.target;
      if (target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  async function runAction(action: () => Promise<void>) {
    setLoading(true);
    setFeedback("");
    try {
      await action();
      await loadDashboard();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button className="btn" onClick={() => setOpen((value) => !value)} type="button">
        Report
      </button>

      {open ? (
        <div className="absolute right-0 z-[120] mt-2 w-[440px] max-w-[92vw] rounded-md border border-border bg-[#0f1728] p-3 shadow-panel">
          <p className="text-sm font-semibold">Report Result</p>
          {feedback ? <p className="mt-2 rounded border border-border px-2 py-1 text-xs text-muted">{feedback}</p> : null}

          <div className="mt-2 grid gap-2">
            <select className="input" onChange={(event) => setTournamentId(event.target.value)} value={tournamentId}>
              <option value="">Select tournament</option>
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>

            <select className="input" onChange={(event) => setMatchId(event.target.value)} value={matchId}>
              <option value="">Select ready match</option>
              {reportableMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  R{match.round} M{match.position}: {match.participantATeam?.name ?? "TBD"} vs{" "}
                  {match.participantBTeam?.name ?? "TBD"}
                </option>
              ))}
            </select>

            <select className="input" onChange={(event) => setWinnerTeamId(event.target.value)} value={winnerTeamId}>
              <option value="">Select winner</option>
              {selectedMatch?.participantATeam ? (
                <option value={selectedMatch.participantATeam.id}>{selectedMatch.participantATeam.name}</option>
              ) : null}
              {selectedMatch?.participantBTeam ? (
                <option value={selectedMatch.participantBTeam.id}>{selectedMatch.participantBTeam.name}</option>
              ) : null}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                min={0}
                onChange={(event) => setScoreA(Number(event.target.value) || 0)}
                placeholder="Score A"
                type="number"
                value={scoreA}
              />
              <input
                className="input"
                min={0}
                onChange={(event) => setScoreB(Number(event.target.value) || 0)}
                placeholder="Score B"
                type="number"
                value={scoreB}
              />
            </div>

            <input
              className="input"
              onChange={(event) => setProofUrl(event.target.value)}
              placeholder="Proof image URL"
              value={proofUrl}
            />

            <button
              className="btn btn-primary"
              disabled={loading || !matchId || !winnerTeamId || !proofUrl.trim()}
              onClick={() =>
                runAction(async () => {
                  await callApi(`/api/matches/${matchId}/report`, {
                    method: "POST",
                    body: JSON.stringify({
                      winnerTeamId,
                      scoreA,
                      scoreB,
                      proofs: [
                        {
                          publicUrl: proofUrl.trim(),
                          storageProvider: "manual",
                          objectKey: proofUrl.trim()
                        }
                      ]
                    })
                  });
                  setProofUrl("");
                  setFeedback("Report submitted.");
                })
              }
              type="button"
            >
              Submit Report
            </button>
          </div>

          {isAdmin ? (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-2 text-sm font-semibold">Review Pending</p>
              <div className="grid gap-2">
                <select className="input" onChange={(event) => setReviewReportId(event.target.value)} value={reviewReportId}>
                  <option value="">Select pending report</option>
                  {pendingReports.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.tournamentName} - R{report.matchRound} M{report.matchPosition}: {report.matchLabel}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  onChange={(event) => setApproveReport(event.target.value === "approve")}
                  value={approveReport ? "approve" : "reject"}
                >
                  <option value="approve">Approve</option>
                  <option value="reject">Reject</option>
                </select>
                <input
                  className="input"
                  onChange={(event) => setDecisionNote(event.target.value)}
                  placeholder="Decision note"
                  value={decisionNote}
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
                {selectedPendingReport ? (
                  <div className="rounded border border-border/60 bg-[#101828] p-2 text-xs text-muted">
                    <p>
                      {selectedPendingReport.tournamentName} - {selectedPendingReport.matchLabel}
                    </p>
                    <p>
                      Score: {selectedPendingReport.scoreA} - {selectedPendingReport.scoreB}
                    </p>
                    <p className="truncate">Proof: {selectedPendingReport.proofAssets[0]?.publicUrl ?? "No proof url"}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
