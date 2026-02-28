import { redirect } from "next/navigation";
import ProfileClient from "@/app/profile/profile-client";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getUserScoreSummaries } from "@/lib/scoring";

export default async function ProfilePage() {
  const user = await getCurrentUser(prisma);
  if (!user) {
    redirect("/login?next=/profile");
  }

  const scoreMap = await getUserScoreSummaries(prisma);
  const userScore = scoreMap.get(user.id);

  return (
    <ProfileClient
      matchWins={userScore?.matchWins ?? 0}
      name={user.name}
      playedTournaments={userScore?.playedTournaments ?? 0}
      points={userScore?.points ?? 0}
      profileImageUrl={user.profileImageUrl}
      tournamentWins={userScore?.tournamentWins ?? 0}
    />
  );
}
