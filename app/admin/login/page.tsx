import { LoginForm } from "@/components/super-admin/login-form";
import "../super-admin.css";

export default function SuperAdminLoginPage() {
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
