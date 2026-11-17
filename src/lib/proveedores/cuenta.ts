/**
 * La cuenta bancaria de un proveedor en campos: CBU (o CVU), alias, banco y titular de
 * la cuenta. Antes era un solo texto libre en cc.proveedores.cbu_alias
 * ("CBU … · alias … · banco · titular … · fuente"); este archivo lo separa y lo vuelve
 * a armar para quien todavía lee el texto (la alerta "Falta CBU" de cc.v_alertas, el
 * plomero y las OP de ClickUp).
 */

export interface Cuenta {
  cbu: string | null;
  alias: string | null;
  banco: string | null;
  titular: string | null;
}

/** Entidad según los 3 primeros dígitos del CBU (código BCRA). CVU: el PSP. */
const BANCOS: Record<string, string> = {
  "007": "Galicia", "011": "Banco Nación", "014": "Banco Provincia", "015": "ICBC", "017": "BBVA",
  "020": "Banco de Córdoba", "027": "Supervielle", "029": "Banco Ciudad", "034": "Patagonia",
  "044": "Hipotecario", "072": "Santander", "143": "Brubank", "150": "HSBC", "191": "Credicoop",
  "285": "Macro", "299": "Comafi", "322": "Industrial", "330": "Banco de Santa Fe", "386": "Banco de Entre Ríos",
};

/** Banco que sale del propio CBU; null si el código no está en la lista. */
export function bancoDelCbu(cbu: string): string | null {
  if (cbu.startsWith("0000003")) return "Mercado Pago";
  if (cbu.startsWith("000")) return null; // otro CVU: billetera que no conocemos
  return BANCOS[cbu.slice(0, 3)] ?? null;
}

/** Saca CBU, alias, banco y titular de un texto libre. Lo que no encuentra queda null. */
export function separarCuenta(texto: string | null | undefined): Cuenta {
  const t = (texto ?? "").trim();
  if (!t) return { cbu: null, alias: null, banco: null, titular: null };

  const cbu = /(?<!\d)\d{22}(?!\d)/.exec(t)?.[0] ?? null;
  const alias = /\balias:?\s+([A-Za-z0-9][A-Za-z0-9.-]{4,18}[A-Za-z0-9])/i.exec(t)?.[1]?.toUpperCase() ?? null;
  // "sin CBU ni titular: verificar…" dice que NO hay titular.
  const titular = /(?<!\b(?:ni|sin)\s)\btitular(?:es)?:?\s+([^(·,;:)]+)/i.exec(t)?.[1]?.trim() || null;
  return { cbu, alias, banco: cbu ? bancoDelCbu(cbu) : null, titular };
}

/** El texto de siempre, armado desde los campos: "CBU … · alias … · banco · titular …". */
export function armarTextoCuenta(c: Cuenta): string | null {
  const partes = [
    c.cbu && `${c.cbu.startsWith("000") ? "CVU" : "CBU"} ${c.cbu}`,
    c.alias && `alias ${c.alias}`,
    c.banco,
    c.titular && `titular ${c.titular}`,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}
