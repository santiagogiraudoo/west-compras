const ORIGEN = "http://interno.invalid";

/**
 * A dónde vuelve el login. Solo rutas internas: se resuelve como lo haría el navegador (que borra
 * tabs y saltos de línea y lee "\" como "/") y tiene que quedar en el mismo origen. Cualquier otra
 * cosa —`javascript:`, otro sitio, "//evil.com" disfrazado— cae en el inicio.
 */
export function destinoSeguroDeLogin(callbackUrl: string | null | undefined): string {
  if (!callbackUrl || !callbackUrl.startsWith("/")) return "/";
  let u: URL;
  try {
    u = new URL(callbackUrl, ORIGEN);
  } catch {
    return "/";
  }
  if (u.origin !== ORIGEN) return "/";
  return u.pathname + u.search + u.hash;
}
