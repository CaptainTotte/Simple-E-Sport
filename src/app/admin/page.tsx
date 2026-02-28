import { redirect } from "next/navigation";
import AdminClientPage from "@/app/admin/admin-client";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const user = await getCurrentUser(prisma);
  if (!user) {
    redirect("/login?next=/admin");
  }

  if (user.globalRole !== "PLATFORM_ADMIN" && user.globalRole !== "TOURNAMENT_ADMIN") {
    redirect("/");
  }

  return <AdminClientPage />;
}
