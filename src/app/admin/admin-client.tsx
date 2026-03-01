"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { showToast } from "@/lib/toast";

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

type TeamRecord = {
  id: string;
  name: string;
  tag: string | null;
  isDummy: boolean;
  myRole: "CAPTAIN" | "PLAYER" | null;
  registrationCount: number;
  members: Array<{
    id: string;
    role: "CAPTAIN" | "PLAYER";
    userId: string | null;
    name: string;
    username: string | null;
  }>;
  pendingInvites: Array<{
    id: string;
    inviteeUserId: string;
    inviteeName: string;
    inviteeUsername: string | null;
  }>;
};

type AdminUserRecord = {
  id: string;
  name: string;
  username: string | null;
  profileImageUrl: string | null;
  globalRole: "PLATFORM_ADMIN" | "TOURNAMENT_ADMIN" | "TEAM_CAPTAIN" | "PLAYER";
  createdAt: string;
  timeoutUntil: string | null;
  bannedAt: string | null;
  isBanned: boolean;
  isTimedOut: boolean;
  isSelf: boolean;
  team: {
    id: string;
    name: string;
    tag: string | null;
    logoUrl: string | null;
    myRole: "CAPTAIN" | "PLAYER" | null;
    members: Array<{
      id: string;
      role: "CAPTAIN" | "PLAYER";
      name: string;
      username: string | null;
    }>;
  } | null;
  stats: {
    points: number;
    playedTournaments: number;
    matchWins: number;
    tournamentWins: number;
  };
};

type AdminView = "create" | "teams" | "users" | "bracket" | "tournaments" | "advanced";

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
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<AdminView>("create");

  const [createName, setCreateName] = useState("");
  const [createRules, setCreateRules] = useState("");
  const [createTeamLimit, setCreateTeamLimit] = useState<4 | 8 | 16>(8);

  const [rulesetGameId, setRulesetGameId] = useState("");
  const [rulesetModeId, setRulesetModeId] = useState("");
  const [poolStrategy, setPoolStrategy] = useState<"RANDOM" | "MANUAL">("RANDOM");
  const [manualContextItemIds, setManualContextItemIds] = useState<string[]>([]);

  const [createTeamName, setCreateTeamName] = useState("");
  const [createTeamTag, setCreateTeamTag] = useState("");
  const [createTeamIsDummy, setCreateTeamIsDummy] = useState(false);
  const [dummyRosterInput, setDummyRosterInput] = useState("");
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [timeoutDialog, setTimeoutDialog] = useState<{ userId: string; days: 3 | 14 | 30 } | null>(null);
  const [usernameDialog, setUsernameDialog] = useState<{ userId: string; value: string } | null>(null);

  const [generateTournamentId, setGenerateTournamentId] = useState("");
  const [reportingData, setReportingData] = useState<TournamentDetail | null>(null);
  const [reportMatchId, setReportMatchId] = useState("");
  const [reportWinnerTeamId, setReportWinnerTeamId] = useState("");
  const [scoreA, setScoreA] = useState(2);
  const [scoreB, setScoreB] = useState(0);
  const [proofUrl, setProofUrl] = useState("");
  const [proofUploading, setProofUploading] = useState(false);

  const [reviewReportId, setReviewReportId] = useState("");
  const [approveReport, setApproveReport] = useState(true);
  const [decisionNote, setDecisionNote] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "active" | "timed_out" | "banned" | "admins" | "players">("all");

  const selectedGame = useMemo(() => games.find((game) => game.id === rulesetGameId), [games, rulesetGameId]);
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
  const selectedTeamRecord = useMemo(
    () => teams.find((team) => team.id === expandedTeamId) ?? null,
    [teams, expandedTeamId]
  );
  const selectedUserRecord = useMemo(
    () => users.find((user) => user.id === expandedUserId) ?? null,
    [users, expandedUserId]
  );
  const selectedUserModerationLocked = selectedUserRecord
    ? selectedUserRecord.isSelf ||
      selectedUserRecord.globalRole === "PLATFORM_ADMIN" ||
      selectedUserRecord.globalRole === "TOURNAMENT_ADMIN"
    : true;
  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    return users.filter((user) => {
      if (userFilter === "active" && (user.isBanned || user.isTimedOut)) {
        return false;
      }
      if (userFilter === "timed_out" && !user.isTimedOut) {
        return false;
      }
      if (userFilter === "banned" && !user.isBanned) {
        return false;
      }
      if (
        userFilter === "admins" &&
        user.globalRole !== "PLATFORM_ADMIN" &&
        user.globalRole !== "TOURNAMENT_ADMIN"
      ) {
        return false;
      }
      if (
        userFilter === "players" &&
        (user.globalRole === "PLATFORM_ADMIN" || user.globalRole === "TOURNAMENT_ADMIN")
      ) {
        return false;
      }
      if (!query) {
        return true;
      }
      const teamValue = user.team ? `${user.team.name} ${user.team.tag ?? ""}` : "";
      const searchable = [
        user.name,
        user.username ?? "",
        teamValue,
        roleLabel(user.globalRole),
        userStatusLabel(user)
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [users, userQuery, userFilter]);
  async function loadReportingData(tournamentId: string) {
    if (!tournamentId) {
      setReportingData(null);
      return;
    }
    const data = await callApi<{ tournament: TournamentDetail }>(`/api/tournaments/${tournamentId}`);
    setReportingData(data.tournament);
  }

  async function loadData() {
    const [gamesData, tournamentsData, teamsData, usersData] = await Promise.all([
      callApi<{ games: Game[] }>("/api/games"),
      callApi<{ tournaments: Tournament[] }>("/api/tournaments"),
      callApi<{ teams: TeamRecord[] }>("/api/teams"),
      callApi<{ users: AdminUserRecord[] }>("/api/admin/users")
    ]);

    setGames(gamesData.games);
    setTournaments(tournamentsData.tournaments);
    setTeams(teamsData.teams);
    setUsers(usersData.users);
  }

  useEffect(() => {
    void loadData().catch((error) => showToast(error.message, "error"));
  }, []);

  useEffect(() => {
    void loadReportingData(generateTournamentId).catch((error) => showToast(error.message, "error"));
  }, [generateTournamentId]);

  useEffect(() => {
    setGenerateTournamentId((current) => {
      if (tournaments.length === 0) {
        return "";
      }
      if (current && tournaments.some((tournament) => tournament.id === current)) {
        return current;
      }
      return tournaments[0].id;
    });
  }, [tournaments]);

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

  useEffect(() => {
    if (!expandedTeamId && !expandedUserId) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedTeamId(null);
        setExpandedUserId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedTeamId, expandedUserId]);

  useEffect(() => {
    if (!selectedUserRecord) {
      setTimeoutDialog(null);
      setUsernameDialog(null);
    }
  }, [selectedUserRecord]);

  async function runAction(action: () => Promise<void>) {
    setLoading(true);
    try {
      await action();
      await loadData();
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

  function toggleManualPoolItem(id: string) {
    setManualContextItemIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  async function deleteTeam(teamId: string, teamName: string) {
    setLoading(true);
    try {
      await callApi(`/api/teams/${teamId}`, { method: "DELETE" });
      setTeams((current) => current.filter((team) => team.id !== teamId));
      if (expandedTeamId === teamId) {
        setExpandedTeamId(null);
      }
      showToast("Team deleted.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete team.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTournament(tournamentId: string, tournamentName: string) {
    setLoading(true);
    try {
      await callApi(`/api/tournaments/${tournamentId}`, { method: "DELETE" });
      setTournaments((current) => current.filter((tournament) => tournament.id !== tournamentId));
      if (generateTournamentId === tournamentId) {
        setGenerateTournamentId("");
        setReportingData(null);
      }
      showToast("Tournament deleted.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete tournament.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function applyUserAction(
    userId: string,
    action:
      | { action: "set_timeout"; days: 3 | 14 | 30 }
      | { action: "clear_timeout" }
      | { action: "ban" }
      | { action: "unban" }
      | { action: "set_username"; username: string }
      | { action: "remove_avatar" },
    successMessage: string
  ) {
    await runAction(async () => {
      await callApi(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(action)
      });
      showToast(successMessage, "success");
    });
  }

  async function deleteUser(userId: string) {
    await runAction(async () => {
      await callApi(`/api/admin/users/${userId}`, {
        method: "DELETE"
      });
      if (expandedUserId === userId) {
        setExpandedUserId(null);
      }
      showToast("User removed.", "success");
    });
  }

  function openTimeoutDialog(userId: string) {
    setUsernameDialog(null);
    setTimeoutDialog({ userId, days: 3 });
  }

  function submitTimeoutDialog() {
    if (!timeoutDialog) {
      return;
    }
    const { userId, days } = timeoutDialog;
    setTimeoutDialog(null);
    void applyUserAction(userId, { action: "set_timeout", days }, `User timed out (${days} days).`);
  }

  function openUsernameDialog(userId: string, currentUsername: string | null) {
    setTimeoutDialog(null);
    setUsernameDialog({ userId, value: currentUsername ?? "" });
  }

  function submitUsernameDialog() {
    if (!usernameDialog) {
      return;
    }
    const nextUsername = usernameDialog.value.trim().toLowerCase();
    if (!nextUsername) {
      showToast("Username is required.", "error");
      return;
    }
    const userId = usernameDialog.userId;
    setUsernameDialog(null);
    void applyUserAction(
      userId,
      {
        action: "set_username",
        username: nextUsername
      },
      "Username updated."
    );
  }

  function roleLabel(role: AdminUserRecord["globalRole"]) {
    if (role === "PLATFORM_ADMIN") return "Platform Admin";
    if (role === "TOURNAMENT_ADMIN") return "Tournament Admin";
    if (role === "TEAM_CAPTAIN") return "Team Captain";
    return "Player";
  }

  function formatDate(dateInput: string | null) {
    if (!dateInput) {
      return "-";
    }
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleString();
  }

  function userStatusLabel(user: AdminUserRecord) {
    if (user.isBanned) {
      return "Banned";
    }
    if (user.isTimedOut && user.timeoutUntil) {
      return `Timeout until ${formatDate(user.timeoutUntil)}`;
    }
    return "Active";
  }

  function formatTournamentStatus(status: string) {
    if (status === "REGISTRATION_OPEN") {
      return "Open";
    }
    return status
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  const menuItems: Array<{ id: AdminView; label: string; helper: string }> = [
    { id: "create", label: "Create Tournament", helper: "Create with game, mode and pool" },
    { id: "teams", label: "Teams", helper: "Create and manage teams" },
    { id: "users", label: "Users", helper: "Moderate player accounts" },
    { id: "bracket", label: "Reports", helper: "Submit and review reports" },
    { id: "tournaments", label: "Tournaments", helper: "View and delete events" },
    { id: "advanced", label: "Advanced", helper: "Maintenance tools" }
  ];

  return (
    <main className="container py-8">
      <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="panel sidebar-panel h-fit lg:sticky lg:top-24">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted">Menus</p>
          <div className="space-y-2">
            {menuItems.map((item) => (
              <button
                className={`admin-menu-item ${activeView === item.id ? "is-active" : ""}`}
                key={item.id}
                onClick={() => setActiveView(item.id)}
                type="button"
              >
                <p className="admin-menu-title">{item.label}</p>
                <p className="admin-menu-helper">{item.helper}</p>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          {activeView === "create" ? (
            <article className="panel">
              <h2 className="text-lg font-semibold">Create Tournament</h2>
                <div className="mt-3 grid gap-2">
                <input
                  className="input"
                  maxLength={48}
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="Tournament name"
                />
                <textarea
                  className="input min-h-24"
                  value={createRules}
                  onChange={(event) => setCreateRules(event.target.value)}
                  placeholder="Rules (shown in Regler tab)"
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
                  <p className="rounded-lg border border-border/70 bg-[#161B22] p-3 text-xs text-muted">
                    This game supports manual pool only.
                  </p>
                ) : null}

                {poolStrategy === "RANDOM" ? (
                  <p className="rounded-lg border border-border/70 bg-[#161B22] p-3 text-xs text-muted">
                    Random pool size is set automatically based on tournament slots (4/8/16 teams).
                  </p>
                ) : (
                  <div className="rounded-lg border border-border/70 bg-[#161B22] p-3">
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
                disabled={loading || !rulesetGameId || !rulesetModeId}
                onClick={() =>
                  runAction(async () => {
                    const created = await callApi<{ tournament: { id: string } }>("/api/tournaments", {
                      method: "POST",
                      body: JSON.stringify({
                        name: createName,
                        description: createRules,
                        teamLimit: createTeamLimit
                      })
                    });
                    const poolItems = poolStrategy === "MANUAL" ? manualContextItemIds.map((contextItemId) => ({ contextItemId })) : [];
                    await callApi(`/api/tournaments/${created.tournament.id}/ruleset`, {
                      method: "POST",
                      body: JSON.stringify({
                        gameId: rulesetGameId,
                        modeId: rulesetModeId,
                        poolStrategy,
                        poolItems
                      })
                    });
                    setGenerateTournamentId(created.tournament.id);
                    showToast("Tournament created.", "success");
                  })
                }
                type="button"
              >
                Create Tournament
              </button>
            </article>
          ) : null}

          {activeView === "teams" ? (
            <article className="panel space-y-4">
              <section>
                <h2 className="text-lg font-semibold">Teams</h2>
                <p className="mt-1 text-sm text-muted">
                  Teams are account-bound. Admins can also create dummy teams without real user accounts.
                </p>
                <div className="mt-3 grid gap-2">
                  <input
                    className="input"
                    onChange={(event) => setCreateTeamName(event.target.value)}
                    placeholder="Team name"
                    value={createTeamName}
                  />
                  <input className="input" onChange={(event) => setCreateTeamTag(event.target.value)} placeholder="Tag (optional)" value={createTeamTag} />
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input checked={createTeamIsDummy} onChange={(event) => setCreateTeamIsDummy(event.target.checked)} type="checkbox" />
                    Create dummy team
                  </label>
                  {createTeamIsDummy ? (
                    <textarea
                      className="input min-h-24"
                      onChange={(event) => setDummyRosterInput(event.target.value)}
                      placeholder="Dummy players (one per line)"
                      value={dummyRosterInput}
                    />
                  ) : null}
                </div>
                <button
                  className="btn btn-primary mt-3"
                  disabled={loading || !createTeamName.trim()}
                  onClick={() =>
                    runAction(async () => {
                      await callApi("/api/teams", {
                        method: "POST",
                        body: JSON.stringify({
                          name: createTeamName,
                          tag: createTeamTag,
                          isDummy: createTeamIsDummy,
                          dummyPlayerNames: createTeamIsDummy
                            ? dummyRosterInput
                                .split("\n")
                                .map((value) => value.trim())
                                .filter(Boolean)
                            : []
                        })
                      });

                      setCreateTeamName("");
                      setCreateTeamTag("");
                      setCreateTeamIsDummy(false);
                      setDummyRosterInput("");
                      showToast("Team created.", "success");
                    })
                  }
                  type="button"
                >
                  Create Team
                </button>
              </section>

              <section className="border-t border-border/70 pt-4">
                <h3 className="text-base font-semibold">All Teams</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted">
                        <th className="w-[360px] py-2">Name</th>
                        <th className="w-[90px] py-2">Invites</th>
                        <th className="w-[120px] py-2">Registrations</th>
                        <th className="w-[90px] py-2 text-right">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((team) => (
                        <tr
                          className="group cursor-pointer border-b border-border/60 transition-colors hover:bg-[#1C212B]/70"
                          key={team.id}
                          onClick={() => {
                            setExpandedTeamId(team.id);
                            setExpandedUserId(null);
                          }}
                        >
                          <td className="py-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium transition-colors group-hover:text-[#7C3AED]" title={team.name}>
                                {team.name}
                              </p>
                              {team.tag ? <p className="text-xs text-muted transition-colors group-hover:text-[#9aa4c2]">[{team.tag}]</p> : null}
                            </div>
                          </td>
                          <td className="py-2">{team.pendingInvites.length}</td>
                          <td className="py-2">{team.registrationCount}</td>
                          <td className="py-2 text-right">
                            <button
                              aria-label={`Delete ${team.name}`}
                              className="btn"
                              disabled={loading}
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteTeam(team.id, team.name);
                              }}
                              title={`Delete ${team.name}`}
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
            </article>
          ) : null}

          {activeView === "users" ? (
            <article className="panel space-y-4">
              <section>
                <h2 className="text-lg font-semibold">Users</h2>
                <p className="mt-1 text-sm text-muted">
                  Click any row to open the player card and moderation controls.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr),220px]">
                  <input
                    className="input"
                    onChange={(event) => setUserQuery(event.target.value)}
                    placeholder="Search users, username, team, role or status"
                    value={userQuery}
                  />
                  <select className="input" onChange={(event) => setUserFilter(event.target.value as typeof userFilter)} value={userFilter}>
                    <option value="all">All users</option>
                    <option value="active">Active only</option>
                    <option value="timed_out">Timed out</option>
                    <option value="banned">Banned</option>
                    <option value="players">Players & captains</option>
                    <option value="admins">Admins</option>
                  </select>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Showing {filteredUsers.length} of {users.length} users
                </p>
              </section>

              <section className="border-t border-border/70 pt-4">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted">
                        <th className="w-[34%] py-2">User</th>
                        <th className="w-[14%] py-2">Role</th>
                        <th className="w-[22%] py-2">Status</th>
                        <th className="w-[20%] py-2">Team</th>
                        <th className="w-[10%] py-2 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr
                          className="group cursor-pointer border-b border-border/60 transition-colors hover:bg-[#1C212B]/70"
                          key={user.id}
                          onClick={() => {
                            setExpandedUserId(user.id);
                            setExpandedTeamId(null);
                          }}
                        >
                          <td className="py-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium transition-colors group-hover:text-[#7C3AED]" title={user.name}>
                                {user.name}
                              </p>
                              <p className="truncate text-xs text-muted transition-colors group-hover:text-[#9aa4c2]" title={user.username ?? ""}>
                                @{user.username ?? "no-username"}
                              </p>
                            </div>
                          </td>
                          <td className="py-2">
                            <span className="block truncate" title={roleLabel(user.globalRole)}>
                              {roleLabel(user.globalRole)}
                            </span>
                          </td>
                          <td className="py-2">
                            <span
                              className={`block truncate ${user.isBanned ? "text-[#EF4444]" : user.isTimedOut ? "text-[#F59E0B]" : ""}`}
                              title={userStatusLabel(user)}
                            >
                              {userStatusLabel(user)}
                            </span>
                          </td>
                          <td className="py-2">
                            <span className="block truncate" title={user.team ? user.team.name : "No team"}>
                              {user.team ? `${user.team.name}${user.team.tag ? ` [${user.team.tag}]` : ""}` : "-"}
                            </span>
                          </td>
                          <td className="py-2 text-right">{user.stats.points}</td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td className="py-4 text-sm text-muted" colSpan={5}>
                            No users match the current search/filter.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
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
                {generateTournamentId && reportableMatches.length === 0 ? (
                  <p className="text-xs text-muted">No reportable matches found for this tournament.</p>
                ) : null}
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
                  <input className="input" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="Proof image URL" />
                </div>
                {proofUrl ? <p className="truncate text-xs text-muted">Proof ready: {proofUrl}</p> : null}
                <button
                  className="btn"
                  disabled={loading || proofUploading}
                  onClick={() => {
                    const missing: string[] = [];
                    if (!generateTournamentId) missing.push("tournament");
                    if (!reportMatchId) missing.push("match");
                    if (!reportWinnerTeamId) missing.push("winner");
                    if (missing.length > 0) {
                      showToast(`Missing: ${missing.join(", ")}.`, "error");
                      return;
                    }
                    const proofsPayload = proofUrl.trim()
                      ? [{ publicUrl: proofUrl.trim(), storageProvider: "manual", objectKey: proofUrl.trim() }]
                      : [];
                    void runAction(async () => {
                      await callApi(`/api/matches/${reportMatchId}/report`, {
                        method: "POST",
                        body: JSON.stringify({
                          winnerTeamId: reportWinnerTeamId,
                          scoreA,
                          scoreB,
                          proofs: proofsPayload
                        })
                      });
                      setProofUrl("");
                      showToast("Match report submitted.", "success");
                    });
                  }}
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
                      showToast(`Report ${approveReport ? "approved" : "rejected"}.`, "success");
                    })
                  }
                  type="button"
                >
                  Submit Review
                </button>
                {pendingReports.find((report) => report.id === reviewReportId) ? (
                  <div className="rounded border border-border/60 bg-[#161B22] p-2 text-xs text-muted">
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
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="w-[16%] py-2 pr-2">Name</th>
                      <th className="w-[10%] py-2 pr-2">Status</th>
                      <th className="w-[16%] py-2 pr-2">Game</th>
                      <th className="w-[9%] py-2 pr-2">Mode</th>
                      <th className="w-[8%] py-2 pr-2">Teams</th>
                      <th className="w-[8%] py-2 pr-2 text-center">Bracket</th>
                      <th className="w-[16%] py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournaments.map((tournament) => {
                      return (
                      <tr className="border-b border-border/60" key={tournament.id}>
                        <td className="py-2 pr-2">
                          <span className="block cursor-help truncate" title={tournament.name}>
                            {tournament.name}
                          </span>
                        </td>
                        <td className="py-2 pr-2 whitespace-nowrap">{formatTournamentStatus(tournament.status)}</td>
                        <td className="py-2 pr-2">
                          <span className="block truncate" title={tournament.ruleset?.game.name ?? "-"}>
                            {tournament.ruleset?.game.name ?? "-"}
                          </span>
                        </td>
                        <td className="py-2 pr-2 whitespace-nowrap">{tournament.ruleset?.mode.label ?? "-"}</td>
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {tournament._count.registrations}/{tournament.teamLimit}
                        </td>
                        <td className="py-2 pr-2 text-center">
                          <button
                            aria-label={`Generate bracket for ${tournament.name}`}
                            className="btn group inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
                            disabled={loading}
                            onClick={() =>
                              runAction(async () => {
                                await callApi(`/api/tournaments/${tournament.id}/generate-bracket`, {
                                  method: "POST",
                                  body: JSON.stringify({})
                                });
                                setGenerateTournamentId(tournament.id);
                                showToast(`Bracket generated for ${tournament.name}.`, "success");
                              })
                            }
                            title="Generate bracket"
                            type="button"
                          >
                            <svg
                              aria-hidden="true"
                              className="transition-transform duration-300 group-hover:rotate-180"
                              fill="none"
                              height="30"
                              style={{ width: 30, height: 30, minWidth: 30, minHeight: 30, display: "block" }}
                              viewBox="0 0 24 24"
                              width="30"
                            >
                              <path
                                d="M21 12a9 9 0 0 1-15.5 6.4L3 16m0 0h4m-4 0v4M3 12a9 9 0 0 1 15.5-6.4L21 8m0 0h-4m4 0V4"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.8"
                              />
                            </svg>
                          </button>
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <Link
                              aria-label={`Open ${tournament.name}`}
                              className="btn inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
                              href={`/tournaments/${tournament.id}`}
                            >
                              <svg
                                aria-hidden="true"
                                fill="none"
                                height="30"
                                style={{ width: 30, height: 30, minWidth: 30, minHeight: 30, display: "block" }}
                                viewBox="0 0 24 24"
                                width="30"
                              >
                                <path
                                  d="M1.5 12S5.5 5.5 12 5.5 22.5 12 22.5 12 18.5 18.5 12 18.5 1.5 12 1.5 12Z"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.8"
                                />
                                <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
                              </svg>
                            </Link>
                            <button
                              aria-label={`Delete ${tournament.name}`}
                              className="btn inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
                              disabled={loading}
                              onClick={() => void deleteTournament(tournament.id, tournament.name)}
                              title={`Delete ${tournament.name}`}
                              type="button"
                            >
                              <svg
                                aria-hidden="true"
                                fill="none"
                                height="30"
                                style={{ width: 30, height: 30, minWidth: 30, minHeight: 30, display: "block" }}
                                viewBox="0 0 24 24"
                                width="30"
                              >
                                <path
                                  d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 7M10 11v6M14 11v6"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.8"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeView === "advanced" ? (
            <section className="panel">
              <h2 className="text-lg font-semibold">Advanced</h2>
              <p className="mt-1 text-sm text-muted">Maintenance tools for catalog and system setup.</p>
              <div className="mt-3">
                <button
                  className="btn"
                  disabled={loading}
                  onClick={() =>
                    runAction(async () => {
                      await callApi("/api/seed-games", { method: "POST" });
                      showToast("Game catalog reseeded.", "success");
                    })
                  }
                  type="button"
                >
                  Seed Games
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </section>

      {selectedTeamRecord ? (
        <div
          className="modal-overlay"
          onClick={() => setExpandedTeamId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Team card modal"
        >
          <article
            className="modal-card pointer-events-auto w-[min(940px,94vw)] p-4"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Team Card</p>
                <h3 className="text-xl font-semibold">
                  {selectedTeamRecord.name}
                  {selectedTeamRecord.tag ? ` [${selectedTeamRecord.tag}]` : ""}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn !border-[#EF4444] !bg-[#2A1318] !text-[#EF4444] hover:!border-[#EF4444] hover:!bg-[#3a1a21]"
                  disabled={loading}
                  onClick={() => {
                    const confirmed = window.confirm("Delete this team permanently?");
                    if (!confirmed) {
                      return;
                    }
                    void deleteTeam(selectedTeamRecord.id, selectedTeamRecord.name);
                  }}
                  type="button"
                >
                  Delete
                </button>
                <button className="btn" onClick={() => setExpandedTeamId(null)} type="button">
                  Close
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="rounded-lg border border-border/70 bg-[#161B22] p-3">
                <div className="flex flex-col items-start">
                  <div className="flex h-28 w-28 items-center justify-center rounded-md border border-border/70 bg-[#0D1117] text-sm text-muted">
                    No logo
                  </div>
                  <p className="mt-3 text-lg font-semibold">{selectedTeamRecord.name}</p>
                  {selectedTeamRecord.tag ? <p className="text-sm text-muted">[{selectedTeamRecord.tag}]</p> : null}
                </div>
                <div className="mt-4 space-y-1 text-sm">
                  <p>Members: {selectedTeamRecord.members.length}</p>
                  <p>Pending invites: {selectedTeamRecord.pendingInvites.length}</p>
                  <p>Registrations: {selectedTeamRecord.registrationCount}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-[#161B22] p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.1em] text-muted">Members</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedTeamRecord.members.map((member) => (
                    <div className="rounded-md border border-border/70 bg-[#11151C] p-2" key={member.id}>
                      {member.username ? (
                        <Link className="font-medium transition-colors hover:text-[#7C3AED]" href={`/players/${member.username}`}>
                          {member.name}
                        </Link>
                      ) : (
                        <p className="font-medium">{member.name}</p>
                      )}
                      <p className="text-xs text-muted">{member.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {selectedUserRecord ? (
        <div
          className="modal-overlay"
          onClick={() => setExpandedUserId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Player card modal"
        >
          <article
            className="modal-card pointer-events-auto relative w-[min(1000px,94vw)] p-4"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Player Card</p>
                <h3 className="text-xl font-semibold">{selectedUserRecord.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn !border-[#EF4444] !bg-[#2A1318] !text-[#EF4444] hover:!border-[#EF4444] hover:!bg-[#3a1a21]"
                  disabled={loading || selectedUserModerationLocked}
                  onClick={() => {
                    const confirmed = window.confirm("Delete this user permanently? This action cannot be undone.");
                    if (!confirmed) {
                      return;
                    }
                    void deleteUser(selectedUserRecord.id);
                  }}
                  type="button"
                >
                  Delete
                </button>
                <button className="btn" onClick={() => setExpandedUserId(null)} type="button">
                  Close
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="min-w-0 rounded-lg border border-border/70 bg-[#161B22] p-3">
                <div className="flex min-h-[300px] flex-col">
                  <div className="flex flex-col items-start text-left">
                    <div className="h-24 w-24 overflow-hidden rounded-md border border-border/70 bg-[#0D1117]">
                      {selectedUserRecord.profileImageUrl ? (
                        <img alt={selectedUserRecord.name} className="h-full w-full object-cover" src={selectedUserRecord.profileImageUrl} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted">No avatar</div>
                      )}
                    </div>
                    <p className="mt-2 truncate text-lg font-semibold">{selectedUserRecord.name}</p>
                    <p className="truncate text-sm text-muted">@{selectedUserRecord.username ?? "no-username"}</p>
                  </div>
                  <div className="mt-4 grid gap-1 text-sm">
                    <p>
                      Team:{" "}
                      {selectedUserRecord.team ? (
                        <>
                          {selectedUserRecord.team.name}
                          {selectedUserRecord.team.tag ? ` [${selectedUserRecord.team.tag}]` : ""} ({selectedUserRecord.team.myRole ?? "-"})
                        </>
                      ) : (
                        "-"
                      )}
                    </p>
                    <p>Played tournaments: {selectedUserRecord.stats.playedTournaments}</p>
                    <p>Match wins: {selectedUserRecord.stats.matchWins}</p>
                    <p>Tournament wins: {selectedUserRecord.stats.tournamentWins}</p>
                  </div>
                  <p
                    className={`mt-auto pt-4 text-xs ${
                      selectedUserRecord.isBanned ? "text-[#EF4444]" : selectedUserRecord.isTimedOut ? "text-[#F59E0B]" : "text-[#22C55E]"
                    }`}
                  >
                    Status: {userStatusLabel(selectedUserRecord)}
                  </p>
                  <p className="mt-1 text-xs text-muted">Joined: {formatDate(selectedUserRecord.createdAt)}</p>
                </div>
              </div>

              <div className="min-w-0 rounded-lg border border-border/70 bg-[#161B22] p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.1em] text-muted">Moderation</p>
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <p className="text-xs uppercase tracking-[0.08em] text-muted">Actions</p>
                    <button
                      className="btn w-full"
                      disabled={loading}
                      onClick={() => openTimeoutDialog(selectedUserRecord.id)}
                      type="button"
                    >
                      Timeout
                    </button>
                    <button
                      className="btn w-full"
                      disabled={loading || selectedUserModerationLocked}
                      onClick={() => void applyUserAction(selectedUserRecord.id, { action: "ban" }, "User banned.")}
                      type="button"
                    >
                      Ban
                    </button>
                    <button
                      className="btn w-full"
                      disabled={loading || selectedUserModerationLocked}
                      onClick={() => void applyUserAction(selectedUserRecord.id, { action: "remove_avatar" }, "Avatar removed.")}
                      type="button"
                    >
                      Remove Avatar
                    </button>
                    <button
                      className="btn w-full"
                      disabled={loading}
                      onClick={() => openUsernameDialog(selectedUserRecord.id, selectedUserRecord.username)}
                      type="button"
                    >
                      Change Username
                    </button>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <p className="text-xs uppercase tracking-[0.08em] text-muted">Undo</p>
                    <button
                      className="btn w-full"
                      disabled={loading || selectedUserModerationLocked}
                      onClick={() => void applyUserAction(selectedUserRecord.id, { action: "clear_timeout" }, "Timeout cleared.")}
                      type="button"
                    >
                      Clear Timeout
                    </button>
                    <button
                      className="btn w-full"
                      disabled={loading || selectedUserModerationLocked}
                      onClick={() => void applyUserAction(selectedUserRecord.id, { action: "unban" }, "Ban removed.")}
                      type="button"
                    >
                      Unban
                    </button>
                    <div className="h-[42px]" />
                    <div className="h-[42px]" />
                  </div>
                </div>
                {selectedUserModerationLocked ? (
                  <p className="mt-3 text-xs text-muted">Protected account. Moderation actions are disabled.</p>
                ) : null}
              </div>
            </div>

            {timeoutDialog?.userId === selectedUserRecord.id ? (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center bg-[#0D1117]/75 p-4"
                onClick={() => setTimeoutDialog(null)}
              >
                <div
                  className="w-full max-w-xs rounded-lg border border-border bg-[#161B22] p-4 shadow-panel"
                  onClick={(event) => event.stopPropagation()}
                >
                  <p className="text-sm font-semibold">Set Timeout</p>
                  <p className="mt-1 text-xs text-muted">Select duration</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[3, 14, 30].map((daysOption) => {
                      const days = daysOption as 3 | 14 | 30;
                      const active = timeoutDialog.days === days;
                      return (
                        <button
                          className={`btn ${active ? "!border-[#7C3AED] !bg-[#271848]" : ""}`}
                          key={days}
                          onClick={() => setTimeoutDialog((current) => (current ? { ...current, days } : current))}
                          type="button"
                        >
                          {days}d
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="btn" onClick={() => setTimeoutDialog(null)} type="button">
                      Cancel
                    </button>
                    <button className="btn btn-primary" onClick={submitTimeoutDialog} type="button">
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {usernameDialog?.userId === selectedUserRecord.id ? (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center bg-[#0D1117]/75 p-4"
                onClick={() => setUsernameDialog(null)}
              >
                <div
                  className="w-full max-w-sm rounded-lg border border-border bg-[#161B22] p-4 shadow-panel"
                  onClick={(event) => event.stopPropagation()}
                >
                  <p className="text-sm font-semibold">Change Username</p>
                  <p className="mt-1 text-xs text-muted">Only lowercase letters, numbers and underscore.</p>
                  <input
                    className="input mt-3"
                    maxLength={24}
                    onChange={(event) =>
                      setUsernameDialog((current) => (current ? { ...current, value: event.target.value } : current))
                    }
                    placeholder="username"
                    value={usernameDialog.value}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="btn" onClick={() => setUsernameDialog(null)} type="button">
                      Cancel
                    </button>
                    <button className="btn btn-primary" onClick={submitUsernameDialog} type="button">
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </article>
        </div>
      ) : null}
    </main>
  );
}
