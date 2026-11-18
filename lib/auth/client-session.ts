/**
 * Client-side session fetching utility with concurrent request deduplication.
 * Prevents multiple simultaneous calls to /api/auth/me across mounting components.
 */

let cachedMePromise: Promise<any> | null = null;

export async function fetchClientSession(token?: string | null): Promise<any> {
  if (cachedMePromise) {
    return cachedMePromise;
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  cachedMePromise = fetch("/api/auth/me", {
    credentials: "include",
    headers,
  })
    .then(async (res) => {
      const data = await res.json();
      return data;
    })
    .finally(() => {
      // Clear in-flight cache shortly after resolution to ensure future navigations get fresh data
      setTimeout(() => {
        cachedMePromise = null;
      }, 1000);
    });

  return cachedMePromise;
}

export function clearClientSessionCache(): void {
  cachedMePromise = null;
}
