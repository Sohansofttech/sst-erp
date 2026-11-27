import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearClientSessionCache,
  fetchClientSession,
  getClientSessionCacheGeneration,
  isClientSessionCacheGenerationCurrent,
} from "../lib/auth/client-session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("session requests are deduplicated only for the same expected identity", async () => {
  const originalFetch = globalThis.fetch;
  const pendingResponses: Array<ReturnType<typeof deferred<Response>>> = [];
  const cacheModes: Array<RequestCache | undefined> = [];
  let requestCount = 0;
  globalThis.fetch = ((_input, init) => {
    requestCount += 1;
    cacheModes.push(init?.cache);
    const pending = deferred<Response>();
    pendingResponses.push(pending);
    return pending.promise;
  }) as typeof fetch;

  try {
    clearClientSessionCache();
    const sameSessionFirst = fetchClientSession(undefined, "session-a");
    const sameSessionSecond = fetchClientSession(undefined, "session-a");
    const otherSession = fetchClientSession(undefined, "session-b");

    assert.equal(requestCount, 2);
    assert.deepEqual(cacheModes, ["no-store", "no-store"]);

    pendingResponses[0].resolve({
      json: async () => ({ success: false, error: "Not authenticated" }),
    } as Response);
    pendingResponses[1].resolve({
      json: async () => ({ success: false, error: "Not authenticated" }),
    } as Response);
    await Promise.all([sameSessionFirst, sameSessionSecond, otherSession]);
  } finally {
    clearClientSessionCache();
    globalThis.fetch = originalFetch;
  }
});

test("clearing the session cache invalidates in-flight request generations", () => {
  const generation = getClientSessionCacheGeneration();
  assert.equal(isClientSessionCacheGenerationCurrent(generation), true);

  clearClientSessionCache();

  assert.notEqual(getClientSessionCacheGeneration(), generation);
  assert.equal(isClientSessionCacheGenerationCurrent(generation), false);
});
