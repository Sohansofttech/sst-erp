import assert from "node:assert/strict";
import test from "node:test";
import {
  getRequestHostname,
  isMainErpHostname,
  normalizeTenantHostname,
} from "../lib/tenant-hostname";

test("normalizes institution hostnames safely", () => {
  assert.equal(normalizeTenantHostname("  Arohan.SSTERP.IN:443  "), "arohan.ssterp.in");
  assert.equal(normalizeTenantHostname("Arohan.SSTERP.IN."), "arohan.ssterp.in");
  assert.equal(normalizeTenantHostname("127.0.0.1:3000"), "127.0.0.1");
});

test("read host precedence and main ERP hosts", () => {
  const headers = new Headers({
    "x-forwarded-host": "Arohan.SSTERP.IN:443",
    host: "internal:3000",
  });
  assert.equal(getRequestHostname(headers), "arohan.ssterp.in");
  assert.equal(isMainErpHostname("ssterp.in"), true);
  assert.equal(isMainErpHostname("www.ssterp.in"), true);
  assert.equal(isMainErpHostname("arohan.ssterp.in"), false);
});
