export function normalizeIndianMobile(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, "");

  if (/^\+?91[6-9]\d{9}$/.test(compact)) {
    return compact.replace(/^\+?91/, "");
  }
  if (/^[6-9]\d{9}$/.test(compact)) {
    return compact;
  }
  return null;
}
