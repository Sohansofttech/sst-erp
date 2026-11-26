import { AsyncLocalStorage } from "node:async_hooks";
import { ForbiddenError } from "@/lib/auth/errors";

export type TenantActorType = "USER" | "WORKER" | "SYSTEM";

export interface TenantTxStore {
  institutionId: string;
  userId: string | null;
  actorType: TenantActorType;
  tx: any;
  mappedTx: any;
  nestingDepth: number;
}

/**
 * Module-private capability primitives. Neither the Symbol nor the WeakSet is
 * exported, preventing any external caller from forging or minting a context.
 */
const TENANT_CAPABILITY = Symbol("TENANT_CAPABILITY");
const verifiedCapabilityTokens = new WeakSet<object>();
const tenantTxAls = new AsyncLocalStorage<TenantTxStore>();

interface InternalCapabilityEnvelope {
  [TENANT_CAPABILITY]: true;
  store: TenantTxStore;
}

// Retained strictly module-private until Stage E database verifier integration.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function runInVerifiedTenantTxStore<T>(
  envelope: InternalCapabilityEnvelope,
  fn: () => Promise<T>
): Promise<T> {
  if (
    !envelope ||
    envelope[TENANT_CAPABILITY] !== true ||
    !verifiedCapabilityTokens.has(envelope)
  ) {
    throw new ForbiddenError("Tenant context violation: missing unforgeable capability.");
  }

  const cleanInstId =
    typeof envelope.store.institutionId === "string"
      ? envelope.store.institutionId.trim()
      : "";
  if (!cleanInstId) {
    throw new ForbiddenError("Tenant context violation: valid institutionId is required.");
  }

  const existing = tenantTxAls.getStore();
  if (existing) {
    if (existing.institutionId !== cleanInstId) {
      throw new ForbiddenError(
        "Cross-tenant access violation: switching institution context inside an active transaction is forbidden."
      );
    }
    return tenantTxAls.run(
      {
        ...existing,
        nestingDepth: existing.nestingDepth + 1,
      },
      fn
    );
  }

  return tenantTxAls.run(
    {
      ...envelope.store,
      institutionId: cleanInstId,
      nestingDepth: envelope.store.nestingDepth || 1,
    },
    fn
  );
}

export function getActiveTenantTxStore(): TenantTxStore | null {
  return tenantTxAls.getStore() ?? null;
}

export function getActiveTenantTx(): any | null {
  return tenantTxAls.getStore()?.tx ?? null;
}

export function getActiveTenantMappedTx(): any | null {
  return tenantTxAls.getStore()?.mappedTx ?? null;
}
