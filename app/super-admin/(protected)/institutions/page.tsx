import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { prisma } from "@/lib/super-admin/prisma";
import { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { CreateInstitutionForm } from "@/components/super-admin/create-institution-form";
import { connection } from "next/server";
import { describeInstitutionType } from "@/lib/institution-type-config";
import { CopyPortalUrlButton } from "@/components/super-admin/copy-portal-url";
import { openInstitutionSupportPortal } from "./actions";
import { getInstitutionPortalUrl } from "@/lib/super-admin/institution-portal";
import { getPortalAccessMessage, isPortalAccessIssue } from "@/lib/super-admin/portal-access-message";
import { z } from "zod";

const pageSize = 20;
export const instant = false;
async function fetchInstitutions(where: Prisma.PlatformInstitutionWhereInput, skip: number) {
  return prisma.platformInstitution.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { _count: { select: { memberships: true, subscriptions: true } } } });
}

export default async function InstitutionsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[]; type?: string | string[]; status?: string | string[]; portalIssue?: string | string[]; portalInstitution?: string | string[] }> }) {
  await connection();
  await requireSuperAdmin();
  const params = await searchParams;
  const search = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 100) ?? "";
  const page = Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1);
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const type = ["SCHOOL", "COLLEGE", "ACADEMY", "OTHER"].includes(rawType ?? "") ? rawType as "SCHOOL" | "COLLEGE" | "ACADEMY" | "OTHER" : undefined;
  const status = ["PENDING", "ACTIVE", "SUSPENDED"].includes(rawStatus ?? "") ? rawStatus as "PENDING" | "ACTIVE" | "SUSPENDED" : undefined;
  const where = {
    archivedAt: null,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { slug: { contains: search, mode: "insensitive" as const } }, { code: { contains: search, mode: "insensitive" as const } }] } : {}),
  };
  let plans: { id: string; name: string; price: number; currency: string; studentLimit: number | null; institutionTypes: Array<"COLLEGE" | "SCHOOL" | "ACADEMY"> }[] = [];
  let plansUnavailable = false;
  try {
    const activePlans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: [{ price: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, currency: true, studentLimit: true, institutionTypes: true },
      take: 100,
    });
    plans = activePlans.map((plan) => ({
      ...plan,
      price: Number(plan.price),
      institutionTypes: plan.institutionTypes.filter(
        (type): type is "COLLEGE" | "SCHOOL" | "ACADEMY" =>
          type === "COLLEGE" || type === "SCHOOL" || type === "ACADEMY",
      ),
    }));
  } catch {
    plansUnavailable = true;
  }
  let rows: Awaited<ReturnType<typeof fetchInstitutions>> = [];
  let total = 0;
  let primaryId: string | null = null;
  let unavailable = false;
  let institutionFetchError: string | null = null;
  try {
    const [rowsResult, totalResult, primaryResult] = await Promise.allSettled([
      fetchInstitutions(where, (page - 1) * pageSize),
      prisma.platformInstitution.count({ where }),
      prisma.platformSetting.findUnique({ where: { key: "primary_institution_id" } }),
    ]);
    if (rowsResult.status === "rejected" || totalResult.status === "rejected") {
      const error = rowsResult.status === "rejected"
        ? rowsResult.reason
        : totalResult.status === "rejected"
          ? totalResult.reason
          : new Error("Institution query failed.");
      console.error("[SuperAdmin:InstitutionManagement] Institution query failed", error);
      institutionFetchError = error instanceof Error ? error.message : "The institution database query failed.";
      unavailable = true;
    } else {
      rows = rowsResult.value;
      total = totalResult.value;
    }
    if (primaryResult.status === "rejected") {
      console.warn("[SuperAdmin:InstitutionManagement] Primary institution setting failed", primaryResult.reason);
    } else if (typeof primaryResult.value?.value === "string") {
      primaryId = primaryResult.value.value;
    }
  } catch (error) {
    console.error("[SuperAdmin:InstitutionManagement] Unexpected institution fetch failure", error);
    institutionFetchError = error instanceof Error ? error.message : "The institution database query failed.";
    unavailable = true;
  }
  let portalNotice: string | null = null;
  const rawIssue = Array.isArray(params.portalIssue) ? params.portalIssue[0] : params.portalIssue;
  if (isPortalAccessIssue(rawIssue)) {
    const rawNoticeId = Array.isArray(params.portalInstitution) ? params.portalInstitution[0] : params.portalInstitution;
    let noticeName: string | null = null;
    if (z.uuid().safeParse(rawNoticeId).success) {
      noticeName = await prisma.platformInstitution
        .findUnique({ where: { id: rawNoticeId as string }, select: { name: true } })
        .then((row) => row?.name ?? null)
        .catch(() => null);
    }
    portalNotice = getPortalAccessMessage(rawIssue, noticeName);
  }
  return <div className="sa-module-page">
    <div className="sa-page-intro"><div><h2>Institution Management</h2><p>Register institutions and monitor their platform status.</p></div></div>
    {portalNotice && <p className="sa-data-error" role="alert">{portalNotice}</p>}
    <CreateInstitutionForm plans={plans} plansUnavailable={plansUnavailable} />
    <section className="sa-card sa-module-panel">
      <form className="sa-search-form" action="/super-admin/institutions"><label className="sa-search-box"><Search size={16} /><input name="q" defaultValue={search} placeholder="Search name, code or slug" aria-label="Search institutions" /></label><select name="type" className="sa-filter-select" defaultValue={type ?? ""} aria-label="Filter by type"><option value="">All types</option><option value="SCHOOL">School / Montessori</option><option value="COLLEGE">College</option><option value="ACADEMY">Academy</option><option value="OTHER">Other</option></select><select name="status" className="sa-filter-select" defaultValue={status ?? ""} aria-label="Filter by status"><option value="">All statuses</option><option value="PENDING">Pending</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select><button className="sa-button sa-button-secondary">Apply</button></form>
      {unavailable ? (
        <p className="sa-data-error" role="alert">
          Institution data could not be loaded: {institutionFetchError || "Check the database connection and approved migrations."}
        </p>
      ) : rows.length === 0 ? (
        <div className="sa-empty-state"><Building2 size={20} /><strong>No institutions found</strong><span>{search ? "Try another search." : "Create an institution using the form above."}</span></div>
      ) : (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead><tr><th>Institution</th><th>Type</th><th>Status</th><th>Members</th><th>Subscriptions</th><th>Registered</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const portalUrl = getInstitutionPortalUrl({
                  id: row.id,
                  name: row.name,
                  code: row.code,
                  slug: row.slug,
                  type: row.type,
                });
                return (
                  <tr key={row.id}>
                    <td><Link href={`/super-admin/institutions/${row.id}`} className="sa-table-link">{row.name}{row.id === primaryId && <span className="sa-status-badge sa-status-active" style={{ marginLeft: 6, fontSize: "0.68rem" }}>Default Portal</span>}</Link><small>{row.code ?? row.slug}</small></td>
                    <td>{describeInstitutionType(row.type)}{row.category ? <small>{row.category}</small> : null}</td>
                    <td><span className={`sa-status-badge sa-status-${row.status.toLowerCase()}`}>{row.status}</span></td>
                    <td>{row._count.memberships}</td>
                    <td>{row._count.subscriptions}</td>
                    <td>{row.createdAt.toLocaleDateString("en-IN")}</td>
                    <td>
                      <div className="sa-action-row" style={{ flexWrap: "wrap" }}>
                        <Link href={`/super-admin/institutions/${row.id}`} className="sa-small-link">View Details</Link>
                        <form action={openInstitutionSupportPortal}>
                          <input type="hidden" name="institutionId" value={row.id} />
                          <button type="submit" className="sa-small-link">Open Institution Portal</button>
                        </form>
                        <CopyPortalUrlButton url={portalUrl} className="sa-small-link" label="Copy Portal URL" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!unavailable && total > pageSize && <div className="sa-pagination"><span>{total} institutions · page {page} of {Math.ceil(total / pageSize)}</span><div>{page > 1 && <Link className="sa-button sa-button-secondary" href={`/super-admin/institutions?q=${encodeURIComponent(search)}&type=${type ?? ""}&status=${status ?? ""}&page=${page - 1}`}>Previous</Link>}{page < Math.ceil(total / pageSize) && <Link className="sa-button sa-button-secondary" href={`/super-admin/institutions?q=${encodeURIComponent(search)}&type=${type ?? ""}&status=${status ?? ""}&page=${page + 1}`}>Next</Link>}</div></div>}
    </section>
  </div>;
}
