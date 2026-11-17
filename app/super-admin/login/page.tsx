import { connection } from "next/server";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/super-admin/login-form";
import { hasSuperAdminRole } from "@/lib/super-admin/authorization";
import { createClient } from "@/lib/supabase/server";
import "../super-admin.css";

export const instant = false;

export default async function SuperAdminLoginPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isSuperAdmin = false;
  if (user) {
    try {
      isSuperAdmin = await hasSuperAdminRole(user.id);
    } catch {
      isSuperAdmin = false;
    }
  }
  if (isSuperAdmin) redirect("/super-admin");

  return (
    <main className="super-admin sa-login">
      <section className="sa-login-card">
        <div className="sa-login-kicker">SOHAN SOFT TECH</div>
        <h1>Super Admin Console</h1>
        <p className="sa-login-intro">
          Sign in to manage institutions, subscriptions, platform users, and
          operational controls.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
