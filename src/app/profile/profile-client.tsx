"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { showToast } from "@/lib/toast";

type ProfileClientProps = {
  name: string;
  profileImageUrl: string | null;
  points: number;
  matchWins: number;
  tournamentWins: number;
  playedTournaments: number;
};

type TeamData = {
  id: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
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

type InvitationData = {
  id: string;
  team: {
    id: string;
    name: string;
    tag: string | null;
    isDummy: boolean;
  };
  inviter: {
    id: string;
    name: string;
    username: string | null;
  };
};

type ProfileView = "general" | "team";

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

export default function ProfileClient({
  name,
  profileImageUrl: initialProfileImageUrl,
  points,
  matchWins,
  tournamentWins,
  playedTournaments
}: ProfileClientProps) {
  const searchParams = useSearchParams();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(initialProfileImageUrl);
  const [generalLoading, setGeneralLoading] = useState(false);

  const [teams, setTeams] = useState<TeamData[]>([]);
  const [invitations, setInvitations] = useState<InvitationData[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  const [createTeamName, setCreateTeamName] = useState("");
  const [createTeamTag, setCreateTeamTag] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [activeView, setActiveView] = useState<ProfileView>("general");

  const myTeam = useMemo(() => teams.find((team) => team.myRole !== null && !team.isDummy) ?? null, [teams]);
  const captainTeam = useMemo(
    () => (myTeam && myTeam.myRole === "CAPTAIN" ? myTeam : null),
    [myTeam]
  );

  async function loadTeamData() {
    const [teamsData, invitationsData] = await Promise.all([
      callApi<{ teams: TeamData[] }>("/api/teams"),
      callApi<{ invitations: InvitationData[] }>("/api/team-invitations")
    ]);

    setTeams(teamsData.teams);
    setInvitations(invitationsData.invitations);
  }

  useEffect(() => {
    void loadTeamData().catch((error) => showToast(error.message, "error"));
  }, []);

  useEffect(() => {
    setProfileImageUrl(initialProfileImageUrl);
  }, [initialProfileImageUrl]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "team") {
      setActiveView("team");
      return;
    }
    if (tab === "general") {
      setActiveView("general");
    }
  }, [searchParams]);

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmNewPassword) {
      showToast("New passwords do not match.", "error");
      return;
    }

    setPasswordLoading(true);
    try {
      await callApi("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      showToast("Password updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update password.", "error");
    } finally {
      setPasswordLoading(false);
    }
  }

  async function uploadProfileImage(file: File) {
    const formData = new FormData();
    formData.append("image", file);

    setGeneralLoading(true);

    try {
      const response = await fetch("/api/profile/image", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not upload profile image.");
      }

      setProfileImageUrl((payload.profileImageUrl as string) ?? null);
      showToast("Profile image updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not upload profile image.", "error");
    } finally {
      setGeneralLoading(false);
    }
  }

  async function uploadTeamLogo(file: File) {
    if (!myTeam?.id || myTeam.myRole !== "CAPTAIN") {
      showToast("Only team captain can upload team logo.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setTeamLoading(true);

    try {
      const response = await fetch(`/api/teams/${myTeam.id}/logo`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not upload team logo.");
      }

      await loadTeamData();
      showToast("Team logo updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not upload team logo.", "error");
    } finally {
      setTeamLoading(false);
    }
  }

  async function createTeam() {
    if (!createTeamName.trim()) {
      showToast("Team name is required.", "error");
      return;
    }

    setTeamLoading(true);
    try {
      await callApi("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: createTeamName.trim(),
          tag: createTeamTag.trim() || undefined,
          isDummy: false
        })
      });
      setCreateTeamName("");
      setCreateTeamTag("");
      await loadTeamData();
      showToast("Team created.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create team.", "error");
    } finally {
      setTeamLoading(false);
    }
  }

  async function sendInvite() {
    if (!captainTeam?.id || !inviteUsername.trim()) {
      showToast("You must be team captain to invite users.", "error");
      return;
    }

    setTeamLoading(true);
    try {
      await callApi(`/api/teams/${captainTeam.id}/invite`, {
        method: "POST",
        body: JSON.stringify({
          username: inviteUsername.trim()
        })
      });
      setInviteUsername("");
      await loadTeamData();
      showToast("Invite sent.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not send invite.", "error");
    } finally {
      setTeamLoading(false);
    }
  }

  async function respondToInvite(invitationId: string, accept: boolean) {
    setTeamLoading(true);
    try {
      await callApi(`/api/team-invitations/${invitationId}/respond`, {
        method: "POST",
        body: JSON.stringify({ accept })
      });
      await loadTeamData();
      showToast(accept ? "Invitation accepted." : "Invitation declined.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not process invitation.", "error");
    } finally {
      setTeamLoading(false);
    }
  }

  async function leaveTeam() {
    if (!myTeam?.id) {
      return;
    }

    const confirmed = window.confirm(`Leave team "${myTeam.name}"?`);
    if (!confirmed) {
      return;
    }

    setTeamLoading(true);
    try {
      await callApi(`/api/teams/${myTeam.id}/leave`, {
        method: "POST"
      });
      await loadTeamData();
      showToast("You left the team.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not leave team.", "error");
    } finally {
      setTeamLoading(false);
    }
  }

  async function disbandTeam() {
    if (!myTeam?.id) {
      return;
    }

    const confirmed = window.confirm(`Disband team "${myTeam.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setTeamLoading(true);
    try {
      await callApi(`/api/teams/${myTeam.id}`, {
        method: "DELETE"
      });
      await loadTeamData();
      showToast("Team disbanded.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not disband team.", "error");
    } finally {
      setTeamLoading(false);
    }
  }

  const menuItems: Array<{ id: ProfileView; label: string; helper: string }> = [
    { id: "general", label: "General", helper: "Password and account settings" },
    { id: "team", label: "Team", helper: "Your team and invitations" }
  ];

  return (
    <main className="container py-8">
      <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="panel sidebar-panel h-fit lg:sticky lg:top-24">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted">Sections</p>
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

        <div className="min-w-0 space-y-4">
          {activeView === "general" ? (
            <section className="panel">
              <h2 className="text-lg font-semibold">General</h2>
              <p className="mt-1 text-sm text-muted">General account settings</p>
              <article className="mt-3 rounded-lg border border-border/70 bg-[#181A1F] p-4">
                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="flex flex-col items-start gap-1">
                    <label className="group relative h-28 w-28 cursor-pointer overflow-hidden rounded-md border border-border/70 bg-[#202329]">
                      {profileImageUrl ? (
                        <img alt="Profile" className="h-full w-full object-cover" src={profileImageUrl} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#202329] text-xs font-semibold text-muted">
                          No image
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-semibold uppercase tracking-[0.12em] text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        Change
                      </div>
                      <input
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={generalLoading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void uploadProfileImage(file);
                          }
                          event.target.value = "";
                        }}
                        type="file"
                      />
                    </label>
                  </div>
                  <div className="min-w-0 rounded-lg border border-border/60 bg-[#181A1F] p-3">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted">Personal</p>
                    <div className="mt-2 space-y-2 text-sm">
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span className="text-muted">Display Name</span>
                        <span className="font-medium">{name}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span className="text-muted">Points</span>
                        <span className="font-medium">{points}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span className="text-muted">Match wins</span>
                        <span className="font-medium">{matchWins}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span className="text-muted">Tournament wins</span>
                        <span className="font-medium">{tournamentWins}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span className="text-muted">Played tournaments</span>
                        <span className="font-medium">{playedTournaments}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span className="text-muted">Team</span>
                        <span className="max-w-[60%] truncate text-right font-medium">
                          {myTeam ? `${myTeam.name}${myTeam.tag ? ` [${myTeam.tag}]` : ""}` : "No team"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span className="text-muted">Team role</span>
                        <span className="font-medium">{myTeam?.myRole ?? "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
              <div className="mt-5 border-t border-border/70 pt-4">
                <h3 className="text-base font-semibold">Change Password</h3>
                <form className="mt-3 space-y-3" onSubmit={submitPassword}>
                  <input
                    autoComplete="current-password"
                    className="input"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Current password"
                    type="password"
                    value={currentPassword}
                  />
                  <input
                    autoComplete="new-password"
                    className="input"
                    minLength={6}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password"
                    type="password"
                    value={newPassword}
                  />
                  <input
                    autoComplete="new-password"
                    className="input"
                    minLength={6}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    placeholder="Confirm new password"
                    type="password"
                    value={confirmNewPassword}
                  />
                  <button className="btn btn-primary w-full" disabled={passwordLoading} type="submit">
                    {passwordLoading ? "Updating..." : "Update password"}
                  </button>
                </form>
              </div>
            </section>
          ) : null}

          {activeView === "team" ? (
            <section className="panel">
              <h2 className="text-lg font-semibold">Team</h2>
              <p className="mt-1 text-sm text-muted">Each account can only belong to one team at a time.</p>

              {myTeam ? (
                <article className="mt-3 rounded-lg border border-border/70 bg-[#181A1F] p-4">
                  <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="flex flex-col items-start gap-1">
                      {myTeam.myRole === "CAPTAIN" ? (
                        <label className="group relative h-28 w-28 cursor-pointer overflow-hidden rounded-md border border-border/70 bg-[#202329]">
                          {myTeam.logoUrl ? (
                            <img alt="Team logo" className="h-full w-full object-cover" src={myTeam.logoUrl} />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[#202329] text-xs font-semibold text-muted">
                              No logo
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-semibold uppercase tracking-[0.12em] text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            Change
                          </div>
                          <input
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            disabled={teamLoading}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                void uploadTeamLogo(file);
                              }
                              event.target.value = "";
                            }}
                            type="file"
                          />
                        </label>
                      ) : (
                        <div className="h-28 w-28 overflow-hidden rounded-md border border-border/70 bg-[#202329]">
                          {myTeam.logoUrl ? (
                            <img alt="Team logo" className="h-full w-full object-cover" src={myTeam.logoUrl} />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[#202329] text-xs font-semibold text-muted">
                              No logo
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 rounded-lg border border-border/60 bg-[#181A1F] p-3">
                      <p className="text-xs uppercase tracking-[0.1em] text-muted">Team</p>
                      <div className="mt-2 space-y-2 text-sm">
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-muted">Name</span>
                          <span className="max-w-[60%] truncate text-right font-medium">
                            {myTeam.name}
                            {myTeam.tag ? ` [${myTeam.tag}]` : ""}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-muted">Your role</span>
                          <span className="font-medium">{myTeam.myRole}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-muted">Registrations</span>
                          <span className="font-medium">{myTeam.registrationCount}</span>
                        </div>
                      </div>
                      <p className="mt-3 text-xs uppercase tracking-[0.1em] text-muted">Members</p>
                      <ul className="mt-1 space-y-1 text-sm">
                        {myTeam.members.map((member) => (
                          <li key={member.id}>
                            {member.username ? (
                              <Link className="transition-colors hover:text-[#7C6EFF]" href={`/players/${member.username}`}>
                                {member.name} (@{member.username})
                              </Link>
                            ) : (
                              member.name
                            )}
                            <span className="text-xs text-muted"> ({member.role})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {myTeam.myRole === "PLAYER" ? (
                      <button className="btn" disabled={teamLoading} onClick={() => void leaveTeam()} type="button">
                        Leave Team
                      </button>
                    ) : null}
                    {myTeam.myRole === "CAPTAIN" ? (
                      <button className="btn ml-auto" disabled={teamLoading} onClick={() => void disbandTeam()} type="button">
                        Disband Team
                      </button>
                    ) : null}
                  </div>
                </article>
              ) : (
                <>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <input
                      className="input"
                      onChange={(event) => setCreateTeamName(event.target.value)}
                      placeholder="Team name"
                      value={createTeamName}
                    />
                    <input
                      className="input"
                      onChange={(event) => setCreateTeamTag(event.target.value)}
                      placeholder="Tag (optional)"
                      value={createTeamTag}
                    />
                  </div>
                  <button className="btn btn-primary mt-3" disabled={teamLoading} onClick={() => void createTeam()} type="button">
                    Create Team
                  </button>
                </>
              )}

              {captainTeam ? (
                <div className="mt-5 grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    className="input"
                    onChange={(event) => setInviteUsername(event.target.value)}
                    placeholder="Invite username"
                    value={inviteUsername}
                  />
                  <button className="btn" disabled={teamLoading} onClick={() => void sendInvite()} type="button">
                    Invite
                  </button>
                </div>
              ) : null}

              <div className="mt-5 border-t border-border/70 pt-4">
                <h3 className="text-base font-semibold">Pending Invitations</h3>
                {invitations.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No pending invitations.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {invitations.map((invitation) => (
                      <article className="rounded-lg border border-border/70 bg-[#181A1F] p-3" key={invitation.id}>
                        <p className="font-medium">
                          {invitation.team.name}
                          {invitation.team.tag ? ` [${invitation.team.tag}]` : ""}
                        </p>
                        <p className="text-sm text-muted">
                          Invited by {invitation.inviter.name}
                          {invitation.inviter.username ? ` (@${invitation.inviter.username})` : ""}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            className="btn btn-primary"
                            disabled={teamLoading}
                            onClick={() => void respondToInvite(invitation.id, true)}
                            type="button"
                          >
                            Accept
                          </button>
                          <button className="btn" disabled={teamLoading} onClick={() => void respondToInvite(invitation.id, false)} type="button">
                            Decline
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
