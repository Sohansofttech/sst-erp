"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { ChevronDown, Eye, EyeOff, KeyRound, Plus } from "lucide-react";
import Link from "next/link";
import { InlineBrandSpinner } from "@/components/shared/BrandLoadingScreen";
import { createInstitution, type InstitutionFormState } from "@/app/super-admin/(protected)/institutions/actions";
import { CopyPortalUrlButton } from "@/components/super-admin/copy-portal-url";

const initial: InstitutionFormState = { error: null, success: null };

type AvailablePlan = {
  id: string;
  name: string;
  price: number;
  currency: string;
  studentLimit: number | null;
  institutionTypes: Array<"COLLEGE" | "SCHOOL" | "ACADEMY">;
};

export function CreateInstitutionForm({
  plans,
  plansUnavailable,
}: {
  plans: AvailablePlan[];
  plansUnavailable: boolean;
}) {
  const [state, action, pending] = useActionState(createInstitution, initial);
  const [institutionType, setInstitutionType] = useState("COLLEGE");
  const [isOpen, setIsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Keep disclosure open whenever validation errors or success feedback is present
  useEffect(() => {
    if (state.error || state.success) {
      setIsOpen(true);
    }
    if (state.success && formRef.current) {
      formRef.current.reset();
      setPassword("");
    }
  }, [state]);

  function generateSecurePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
    let gen = "";
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      const array = new Uint32Array(14);
      window.crypto.getRandomValues(array);
      for (let i = 0; i < 14; i++) {
        gen += chars[array[i] % chars.length];
      }
    } else {
      for (let i = 0; i < 14; i++) {
        gen += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    setPassword(gen);
    setShowPassword(true);
  }

  return (
    <details
      className="sa-form-disclosure"
      open={isOpen}
      onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className="sa-button sa-button-primary sa-create-institution-trigger"
        onClick={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        Create institution
        <ChevronDown
          size={16}
          aria-hidden="true"
          style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}
        />
      </summary>
      <form ref={formRef} className="sa-card sa-form-card sa-form-grid sa-create-institution-form" action={action}>
        <label>Subscription plan
          <select name="planId" required defaultValue="" disabled={plansUnavailable || plans.length === 0}>
            <option value="" disabled>Select an active plan</option>
            {plans.filter((plan) => plan.institutionTypes.length === 0 || plan.institutionTypes.includes(institutionType as "COLLEGE" | "SCHOOL" | "ACADEMY")).map((plan) => (
              <option value={plan.id} key={plan.id}>
                {plan.name} · {plan.currency} {plan.price} · {plan.studentLimit === null ? "Unlimited students" : `Up to ${plan.studentLimit} students`}
              </option>
            ))}
          </select>
        </label>
        {plansUnavailable
          ? <p className="sa-form-message sa-form-error" role="alert">Subscription plans are unavailable. Confirm the database connection and that the approved student-limit migration is installed.</p>
          : plans.length === 0
            ? <p className="sa-form-help">Create an active subscription plan before registering an institution.</p>
            : <p className="sa-form-help">Free plans activate immediately. Paid plans remain PAST_DUE until Razorpay confirms payment; student registration requires an active plan.</p>}
        <label>Institution type
          <select name="type" value={institutionType} onChange={(event) => setInstitutionType(event.target.value)}>
            <option value="COLLEGE">College</option>
            <option value="SCHOOL">School / Montessori</option>
            <option value="ACADEMY">Academy</option>
          </select>
        </label>
        <label>{institutionType === "SCHOOL" ? "School name" : institutionType === "ACADEMY" ? "Academy name" : "College name"}<input name="name" required minLength={2} maxLength={160} /></label>
        <label>{institutionType === "SCHOOL" ? "School code" : institutionType === "ACADEMY" ? "Academy code" : "College code"}<input name="code" placeholder={institutionType === "COLLEGE" ? "e.g. CC101 (Auto-generated if empty)" : "e.g. INST101 (Auto-generated if empty)"} maxLength={40} /></label>
        {institutionType === "COLLEGE" && <label>University / affiliation<input name="category" maxLength={160} placeholder="Affiliated university or board" /></label>}
        {institutionType === "SCHOOL" && <label>School category<select name="category"><option value="School">School</option><option value="Montessori">Montessori</option><option value="School / Montessori">School / Montessori</option></select></label>}
        {institutionType === "ACADEMY" && <label>Academy / course category<input name="category" maxLength={160} placeholder="e.g. Competitive Exams, Professional Training" /></label>}
        <label>Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} /></label>
        <label>Contact email<input name="email" type="email" /></label>
        <label>Phone<input name="phone" maxLength={40} /></label>
        <label>Street address<input name="address" maxLength={300} /></label>
        <label>City<input name="city" maxLength={100} /></label>
        <label>State<input name="state" maxLength={100} /></label>
        <label>Postal code<input name="postalCode" maxLength={20} /></label>
        <label>Country<input name="country" defaultValue="India" required maxLength={80} /></label>
        <label>Website<input name="website" type="url" /></label>
        <label>Administrator full name<input name="adminName" required minLength={2} maxLength={160} /></label>
        <label>Administrator email<input name="adminEmail" type="email" required /></label>
        <label>
          Administrator password
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <input
              name="adminPassword"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="sa-button sa-button-secondary"
              style={{ padding: "0.4rem 0.6rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? "Hide password" : "Show password"}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              type="button"
              className="sa-button sa-button-secondary"
              style={{ padding: "0.4rem 0.6rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap" }}
              onClick={generateSecurePassword}
              title="Generate strong random password"
            >
              <KeyRound size={15} /> Generate
            </button>
          </div>
          {password && (
            <span style={{ fontSize: "0.75rem", display: "block", marginTop: "0.25rem", color: password.length < 6 ? "#dc2626" : password.length < 8 ? "#d97706" : "#16a34a" }}>
              {password.length < 6 ? "Too short (minimum 6 characters required)" : password.length < 8 ? "Moderate strength" : "Strong password"}
            </span>
          )}
        </label>
        <label>Administrator phone<input name="adminPhone" maxLength={40} /></label>
        {state.error && <p className="sa-form-message sa-form-error" role="alert">{state.error}</p>}
        {state.success && <p className="sa-form-message sa-form-success" role="status">{state.success}</p>}
        {state.institutionId && state.portalUrl && (
          <div className="sa-card sa-form-card" style={{ gridColumn: "1 / -1" }} role="status">
            <strong>{state.institutionName}</strong>
            <p className="sa-muted-copy">Institution code: {state.institutionCode || "Not configured"} · Type: {state.institutionType}</p>
            <p className="sa-muted-copy" style={{ wordBreak: "break-all" }}>Portal URL: {state.portalUrl}</p>
            <div className="sa-action-row">
              <Link className="sa-button sa-button-primary" href={state.portalUrl}>Open Institution Portal</Link>
              <CopyPortalUrlButton url={state.portalUrl} />
              <Link className="sa-button sa-button-secondary" href={`/super-admin/institutions/${state.institutionId}`}>View Institution</Link>
            </div>
          </div>
        )}
        <button className="sa-button sa-button-primary" disabled={pending || !!state.institutionId || plansUnavailable || plans.length === 0}>
          {pending ? <><InlineBrandSpinner size={14} /> Saving…</> : "Create institution"}
        </button>
      </form>
    </details>
  );
}
