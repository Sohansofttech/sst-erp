import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSuperAdminRole } from "@/lib/super-admin/authorization";
import { isDevelopmentBypassEnabled } from "@/lib/super-admin/development-access";
import { getSession } from "@/lib/auth/session";

export async function requireSuperAdmin() {
  if (isDevelopmentBypassEnabled()) return { id: null, email: null, developmentMode: true as const };

  const session = await getSession();
  if (session) {
    if (session.role === "SUPER_ADMIN") {
      return { id: session.userId, email: session.email ?? null, developmentMode: false as const };
    }
    throw new Error("Super Admin access is required.");
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  if (!(await hasSuperAdminRole(user.id))) throw new Error("Super Admin access is required.");
  return { id: user.id, email: user.email ?? null, developmentMode: false as const };
}
