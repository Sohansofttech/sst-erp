import { redirect } from "next/navigation";
import { ForbiddenError, getSession } from "@/lib/auth/session";

export async function requireTenantPageSession(allowedRoles: string[]) {
  let session;
  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/login?error=institution_inactive");
    }
    throw error;
  }

  if (!session?.userId) redirect("/login");
  if (!allowedRoles.includes(session.role.toUpperCase())) redirect("/login?error=forbidden");
  return session;
}
