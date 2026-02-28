import { redirect } from "next/navigation";
import ProfileClient from "@/app/profile/profile-client";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const user = await getCurrentUser(prisma);
  if (!user) {
    redirect("/login?next=/profile");
  }

  return <ProfileClient name={user.name} username={user.username ?? ""} />;
}
