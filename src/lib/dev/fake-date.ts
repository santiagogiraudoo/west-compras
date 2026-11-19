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
 * Cookie format: YYYY-MM-DD. Se toma como el mediodía de ese día en Mendoza: new Date("2026-11-20")
 * es medianoche UTC, que en Mendoza es el 19 a las 21 hs, y hoyArgentina() daba un día menos.
 *
 * Ojo: el corrimiento vive en globalThis (lo comparten todos los requests del proceso) y la
 * base no se entera: now() y current_date siguen con la fecha real. Es solo para desarrollo.
 */
export function computeFakeOffset(cookieValue: string | undefined, ahora = Date.now()): number {
  if (!cookieValue || !/^\d{4}-\d{2}-\d{2}$/.test(cookieValue)) return 0;
  const parsed = new Date(`${cookieValue}T12:00:00-03:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime() - ahora;
}
