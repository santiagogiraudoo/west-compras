export const FAKE_DATE_COOKIE = "fake-today";

// Offset is stored on globalThis so that all Next.js bundles (middleware,
// server components, server actions, instrumentation) share a single source
// of truth. A module-level `let` would give each bundle its own isolated copy.
declare global {
  var __westGodModeFakeOffsetMs: number | undefined;
}

export function getFakeOffset(): number {
  return globalThis.__westGodModeFakeOffsetMs ?? 0;
}

export function setFakeOffset(ms: number): void {
  globalThis.__westGodModeFakeOffsetMs = ms;
}

/**
 * Compute how many ms to add to `Date.now()` to produce the fake "today"
 * encoded in the cookie value. Returns 0 for missing, empty, or unparseable
 * cookies.
 *
 * Cookie format: YYYY-MM-DD (interpreted as local-midnight of that day).
 */
export function computeFakeOffset(cookieValue: string | undefined): number {
  if (!cookieValue) return 0;
  const parsed = new Date(cookieValue);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime() - Date.now();
}
