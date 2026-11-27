import { Suspense } from "react";
import { redirect } from "next/navigation";

export default function SuperAdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}) {
  return (
    <Suspense fallback={null}>
      <SuperAdminLoginRedirect searchParams={searchParams} />
    </Suspense>
  );
}

async function SuperAdminLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}) {
  const params = await searchParams;

  const query = new URLSearchParams({
    role: "super-admin",
  });

  if (params.error) {
    query.set("error", String(params.error));
  }

  if (params.next) {
    query.set("next", String(params.next));
  }

  redirect(`/login?${query.toString()}`);
  return null;
}
