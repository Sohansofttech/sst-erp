"use client";

import { useActionState, useState } from "react";
import { InlineBrandSpinner } from "@/components/shared/BrandLoadingScreen";
import { editInstitution, type InstitutionFormState } from "@/app/super-admin/(protected)/institutions/actions";
import { schoolCategories } from "@/lib/institution-type-config";

const initial: InstitutionFormState = { error: null, success: null };
type InstitutionData = { id: string; name: string; code: string | null; slug: string; type: "SCHOOL" | "COLLEGE" | "ACADEMY" | "OTHER"; category: string | null; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; postalCode: string | null; country: string; website: string | null };

export function EditInstitutionForm({ institution }: { institution: InstitutionData }) {
  const [state, action, pending] = useActionState(editInstitution, initial);
  const [type, setType] = useState<InstitutionData["type"]>(institution.type);
  const existingSchoolCategory = (schoolCategories as readonly string[]).includes(institution.category ?? "") ? institution.category! : "School";
  return <form className="sa-form-grid sa-card sa-form-card" action={action}>
    <input type="hidden" name="id" value={institution.id} />
    <label>Name<input name="name" defaultValue={institution.name} required minLength={2} maxLength={160} /></label><label>Code<input name="code" defaultValue={institution.code ?? ""} maxLength={40} /></label><label>Slug<input name="slug" defaultValue={institution.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} /></label>
    <label>Institution type<select name="type" value={type} onChange={(event) => setType(event.target.value as InstitutionData["type"])}><option value="COLLEGE">College</option><option value="SCHOOL">School / Montessori</option><option value="ACADEMY">Academy</option><option value="OTHER">Other</option></select></label>
    {type === "SCHOOL"
      ? <label>School category<select name="category" defaultValue={existingSchoolCategory}>{schoolCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      : <label>{type === "ACADEMY" ? "Academy / course category" : type === "COLLEGE" ? "University / affiliation" : "Category"}<input name="category" defaultValue={institution.category ?? ""} maxLength={160} /></label>}
    <label>Contact email<input name="email" type="email" defaultValue={institution.email ?? ""} /></label><label>Phone<input name="phone" defaultValue={institution.phone ?? ""} maxLength={40} /></label><label>Street address<input name="address" defaultValue={institution.address ?? ""} maxLength={300} /></label><label>City<input name="city" defaultValue={institution.city ?? ""} maxLength={100} /></label><label>State<input name="state" defaultValue={institution.state ?? ""} maxLength={100} /></label><label>Postal code<input name="postalCode" defaultValue={institution.postalCode ?? ""} maxLength={20} /></label><label>Country<input name="country" defaultValue={institution.country} required maxLength={80} /></label><label>Website<input name="website" type="url" defaultValue={institution.website ?? ""} /></label>
    {state.error && <p className="sa-form-message sa-form-error" role="alert">{state.error}</p>}{state.success && <p className="sa-form-message sa-form-success" role="status">{state.success}</p>}<button className="sa-button sa-button-primary" disabled={pending}>{pending ? <><InlineBrandSpinner size={14} /> Saving…</> : "Save changes"}</button>
  </form>;
}
