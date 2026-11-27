export function normalizeTenantHostname(input: string | null | undefined): string {
  const first = (input || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  if (!first) return "";

  if (first.startsWith("[") && first.includes("]")) {
    return first.slice(1, first.indexOf("]"));
  }

  const withoutPort = first.replace(/:\d+$/, "");

  return withoutPort.replace(/\.$/, "");
}

export function getRequestHostname(headers: Headers): string {
  return normalizeTenantHostname(
    headers.get("x-forwarded-host") ||
      headers.get("x-vercel-forwarded-host") ||
      headers.get("host")
  );
}

export function isMainErpHostname(hostname: string): boolean {
  const host = normalizeTenantHostname(hostname);
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";

  let configuredHost = "";
  try {
    configuredHost = configured ? normalizeTenantHostname(new URL(configured).host) : "";
  } catch {
    configuredHost = "";
  }

  return (
    host === "ssterp.in" ||
    host === "www.ssterp.in" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    (!!configuredHost && host === configuredHost)
  );
}
