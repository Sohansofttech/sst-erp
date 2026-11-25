"use client";

/**
 * ============================================================================
 * Module: lib/division-store.tsx
 * Description: Lightweight React context that manages the active division
 *              selection for the admin portal UI.
 *
 * Design decisions:
 * - Intentionally separate from lib/store.tsx to avoid modifying the 7000-line
 *   store. This keeps division state isolated and testable.
 * - Division list is fetched from GET /api/admin/divisions (server-validated).
 * - Active division ID is persisted in the `sst_active_division` cookie so
 *   that resolveDivisionContext() on the server validates it on each API call.
 * - The cookie is set via document.cookie (HttpOnly is NOT used here because
 *   the client needs to write it; the server always re-validates its content).
 * ============================================================================
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { DivisionOption } from "@/components/layout/DivisionSwitcher";

export const ALL_DIVISIONS_ID = "__ALL__";

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

const COOKIE_NAME = "sst_active_division";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface DivisionContextValue {
  /** All ACTIVE divisions the user is authorized to access */
  divisions: DivisionOption[];
  /** Whether the user has institution-wide admin access */
  isInstitutionWideAdmin: boolean;
  /** Currently selected division ID, or ALL_DIVISIONS_ID ("__ALL__") */
  activeDivisionId: string | undefined;
  /** The active DivisionOption object (undefined when ALL or none selected) */
  activeDivision: DivisionOption | undefined;
  /** Whether the division list is being fetched */
  isDivisionsLoading: boolean;
  /** Error message if the fetch failed */
  divisionsError: string | null;
  /** Set the active division by ID (also updates the cookie) */
  setActiveDivision: (id: string) => void;
  /** Re-fetch the division list from the server */
  refreshDivisions: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DivisionContext = createContext<DivisionContextValue | undefined>(undefined);

export function useDivision(): DivisionContextValue {
  const ctx = useContext(DivisionContext);
  if (!ctx) {
    throw new Error("useDivision must be used inside <DivisionProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DivisionProvider({ children }: { children: React.ReactNode }) {
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [isInstitutionWideAdmin, setIsInstitutionWideAdmin] = useState(false);
  const [activeDivisionId, setActiveDivisionId] = useState<string | undefined>(undefined);
  const [isDivisionsLoading, setIsDivisionsLoading] = useState(true);
  const [divisionsError, setDivisionsError] = useState<string | null>(null);

  const fetchDivisions = useCallback(async () => {
    setIsDivisionsLoading(true);
    setDivisionsError(null);
    try {
      const res = await fetch("/api/admin/divisions", {
        credentials: "include",
        headers: { "Cache-Control": "no-store" },
      });
      if (!res.ok) {
        // Not authenticated or no permission — silently suppress; leave empty
        if (res.status === 401 || res.status === 403) {
          setDivisions([]);
          return;
        }
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `Failed to load divisions (${res.status})`);
      }
      const json = await res.json();
      const list: DivisionOption[] = (json.data || []).filter(
        (d: DivisionOption) => d.status === "ACTIVE"
      );
      const wideAdmin: boolean = json.isInstitutionWideAdmin === true;
      setDivisions(list);
      setIsInstitutionWideAdmin(wideAdmin);

      // Determine initial active division
      const savedCookie = readCookie(COOKIE_NAME);

      if (savedCookie === ALL_DIVISIONS_ID && wideAdmin) {
        // Restore "All Divisions" view for wide admins
        setActiveDivisionId(ALL_DIVISIONS_ID);
        return;
      }

      if (savedCookie && list.some((d) => d.id === savedCookie)) {
        // Restore previously selected division if it's still in the authorized list
        setActiveDivisionId(savedCookie);
        return;
      }

      // Fall back to the default division or the first available
      const defaultDiv = list.find((d) => d.isDefault) || list[0];
      if (defaultDiv) {
        setActiveDivisionId(defaultDiv.id);
        writeCookie(COOKIE_NAME, defaultDiv.id);
      } else if (wideAdmin) {
        // Wide admin with no active divisions — go to "All" view
        setActiveDivisionId(ALL_DIVISIONS_ID);
        writeCookie(COOKIE_NAME, ALL_DIVISIONS_ID);
      }
    } catch (err: any) {
      setDivisionsError(err.message || "Failed to load divisions.");
    } finally {
      setIsDivisionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDivisions();
  }, [fetchDivisions]);

  const setActiveDivision = useCallback(
    (id: string) => {
      // Validate that the selected ID is in the authorized list (or is ALL for wide admins)
      if (id === ALL_DIVISIONS_ID) {
        if (!isInstitutionWideAdmin) return; // Cannot select ALL without wide admin
        setActiveDivisionId(ALL_DIVISIONS_ID);
        writeCookie(COOKIE_NAME, ALL_DIVISIONS_ID);
        return;
      }
      const found = divisions.find((d) => d.id === id);
      if (!found) {
        // Unauthorized division ID rejected silently — no state update
        console.warn("[DivisionSwitcher] Rejected unauthorized division ID:", id);
        return;
      }
      setActiveDivisionId(id);
      writeCookie(COOKIE_NAME, id);
    },
    [divisions, isInstitutionWideAdmin]
  );

  const activeDivision =
    activeDivisionId && activeDivisionId !== ALL_DIVISIONS_ID
      ? divisions.find((d) => d.id === activeDivisionId)
      : undefined;

  return (
    <DivisionContext.Provider
      value={{
        divisions,
        isInstitutionWideAdmin,
        activeDivisionId,
        activeDivision,
        isDivisionsLoading,
        divisionsError,
        setActiveDivision,
        refreshDivisions: fetchDivisions,
      }}
    >
      {children}
    </DivisionContext.Provider>
  );
}
