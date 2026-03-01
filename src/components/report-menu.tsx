"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { showToast } from "@/lib/toast";

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
  const [proofUploading, setProofUploading] = useState(false);

  const [tournamentId, setTournamentId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [winnerTeamId, setWinnerTeamId] = useState("");
  const [scoreA, setScoreA] = useState(2);
  const [scoreB, setScoreB] = useState(0);
  const [proofUrl, setProofUrl] = useState("");

  const [reviewReportId, setReviewReportId] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"" | "approve" | "reject">("");
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
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    setTournamentId("");
    setMatchId("");
    setWinnerTeamId("");
    setProofUrl("");
    setReviewReportId("");
    setReviewDecision("");
    void loadDashboard().catch((error) => showToast(error.message, "error"));
  }, [open]);

  useEffect(() => {
    if (!selectedTournament) {
      setMatchId("");
      return;
    }
    if (!selectedTournament.matches.find((match) => match.id === matchId)) {
      setMatchId("");
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
    setWinnerTeamId((current) => (allowedIds.includes(current) ? current : ""));
  }, [selectedMatch]);

  useEffect(() => {
    if (!pendingReports.find((report) => report.id === reviewReportId)) {
      setReviewReportId("");
      setReviewDecision("");
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
    try {
      await action();
      await loadDashboard();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unexpected error.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function uploadProofImage(file: File) {
    const formData = new FormData();
    formData.append("image", file);
    setProofUploading(true);
    try {
      const response = await fetch("/api/reports/proof", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not upload proof image.");
      }
      setProofUrl(typeof payload.publicUrl === "string" ? payload.publicUrl : "");
      showToast("Proof image uploaded.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not upload proof image.", "error");
    } finally {
      setProofUploading(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button className="btn" onClick={() => setOpen((value) => !value)} type="button">
        Report Results
      </button>

      {open ? (
        <div className="absolute right-0 z-[120] mt-2 w-[440px] max-w-[92vw] rounded-md border border-border bg-[#181A1F] p-3 shadow-panel">
          <p className="text-sm font-semibold">Report Results</p>

          <div className="mt-2 grid gap-2">
            <select className="input" onChange={(event) => setTournamentId(event.target.value)} value={tournamentId}>
              <option value="">Select</option>
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>

            <select className="input" onChange={(event) => setMatchId(event.target.value)} value={matchId}>
              <option value="">Select</option>
              {reportableMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  R{match.round} M{match.position}: {match.participantATeam?.name ?? "TBD"} vs{" "}
                  {match.participantBTeam?.name ?? "TBD"}
                </option>
              ))}
            </select>
            {tournamentId && reportableMatches.length === 0 ? (
              <p className="text-xs text-muted">No reportable matches found for this tournament.</p>
            ) : null}

            <select className="input" onChange={(event) => setWinnerTeamId(event.target.value)} value={winnerTeamId}>
              <option value="">Select</option>
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

            <div className="grid gap-2 sm:grid-cols-[auto,1fr]">
              <label className="btn cursor-pointer text-center">
                {proofUploading ? "Uploading..." : "Upload Proof"}
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={proofUploading || loading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadProofImage(file);
                    }
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              <input
                className="input"
                onChange={(event) => setProofUrl(event.target.value)}
                placeholder="Proof image URL"
                value={proofUrl}
              />
            </div>
            {proofUrl ? <p className="truncate text-xs text-muted">Proof ready: {proofUrl}</p> : null}

            <button
              className="btn btn-primary"
              disabled={loading || proofUploading}
              onClick={() => {
                const proofRequired = !isAdmin;
                const missing: string[] = [];
                if (!tournamentId) missing.push("tournament");
                if (!matchId) missing.push("match");
                if (!winnerTeamId) missing.push("winner");
                if (proofRequired && !proofUrl.trim()) missing.push("proof");
                if (missing.length > 0) {
                  showToast(`Missing: ${missing.join(", ")}.`, "error");
                  return;
                }
                const proofsPayload = proofUrl.trim()
                  ? [
                      {
                        publicUrl: proofUrl.trim(),
                        storageProvider: "manual",
                        objectKey: proofUrl.trim()
                      }
                    ]
                  : [];
                void runAction(async () => {
                  await callApi(`/api/matches/${matchId}/report`, {
                    method: "POST",
                    body: JSON.stringify({
                      winnerTeamId,
                      scoreA,
                      scoreB,
                      proofs: proofsPayload
                    })
                  });
                  setProofUrl("");
                  showToast("Report submitted.", "success");
                });
              }}
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
                  <option value="">Select</option>
                  {pendingReports.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.tournamentName} - R{report.matchRound} M{report.matchPosition}: {report.matchLabel}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  onChange={(event) => setReviewDecision(event.target.value as "" | "approve" | "reject")}
                  value={reviewDecision}
                >
                  <option value="">Select</option>
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
                  disabled={loading || !reviewReportId || !reviewDecision}
                  onClick={() =>
                    runAction(async () => {
                      await callApi(`/api/reports/${reviewReportId}/approve`, {
                        method: "POST",
                        body: JSON.stringify({
                          approve: reviewDecision === "approve",
                          decisionNote
                        })
                      });
                      showToast(`Report ${reviewDecision === "approve" ? "approved" : "rejected"}.`, "success");
                    })
                  }
                  type="button"
                >
                  Submit Review
                </button>
                {selectedPendingReport ? (
                  <div className="rounded border border-border/60 bg-[#202329] p-2 text-xs text-muted">
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
