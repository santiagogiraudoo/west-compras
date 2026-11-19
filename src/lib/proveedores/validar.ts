/**
 * Validaciones del alta de proveedor. Puras, sin base, para usarlas igual en el
 * formulario y en el server.
 */
import { bancoDelCbu } from "./cuenta";

export const CONDICIONES_IVA = ["Responsable Inscripto", "Monotributo", "Exento", "En negro (sin factura)"] as const;
export const MEDIOS_PAGO = ["Transferencia", "Echeq", "Cheque", "Efectivo"] as const;

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** Quien cobra en negro y en efectivo no necesita cuenta bancaria. */
export function cobraSinCuenta(condicionIva: string | null, medioPago: string | null): boolean {
  return condicionIva === "En negro (sin factura)" && medioPago === "Efectivo";
}

/** CUIT argentino: 11 dígitos con dígito verificador. Devuelve el CUIT con guiones o null. */
export function normalizarCuit(entrada: string): string | null {
  const d = soloDigitos(entrada);
  if (d.length !== 11) return null;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  if (verificador !== Number(d[10])) return null;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** CBU o CVU: 22 dígitos con sus dos verificadores. Devuelve solo los dígitos o null. */
export function normalizarCbu(entrada: string): string | null {
  const s = entrada.trim();
  if (!/^[\d\s-]+$/.test(s)) return null;
  const d = soloDigitos(s);
  if (d.length !== 22) return null;
  const ok = (bloque: string, pesos: number[]) => {
    const suma = pesos.reduce((acc, p, i) => acc + p * Number(bloque[i]), 0);
    return (10 - (suma % 10)) % 10 === Number(bloque[pesos.length]);
  };
  if (!ok(d.slice(0, 8), [7, 1, 3, 9, 7, 1, 3])) return null;
  if (!ok(d.slice(8), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])) return null;
  return d;
}

/** Alias: 6 a 20 caracteres (letras, números, punto y guion). En mayúsculas o null. */
export function normalizarAlias(entrada: string): string | null {
  const s = entrada.trim();
  return /^[A-Za-z0-9.-]{6,20}$/.test(s) ? s.toUpperCase() : null;
}

/**
 * WhatsApp, siempre en el formato internacional de celular argentino: 549 + código de
 * área + número, sin 0 ni 15 (5493511234567). Así "0351 15 123-4567", "351 1234567" y
 * "+54 9 351 123 4567" son el mismo número y el aviso por WhatsApp los puede usar.
 * Un número de otro país (+ y otro código) queda con sus dígitos. Null si no se entiende.
 */
export function normalizarTelefono(entrada: string): string | null {
  let d = soloDigitos(entrada);
  if (d.startsWith("00")) d = d.slice(2);
  const internacional = entrada.trim().startsWith("+") || d.startsWith("54");
  if (internacional && !d.startsWith("54")) return d.length >= 10 && d.length <= 15 ? d : null;
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9") && d.length === 11) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  // El 15 va después del código de área (2 a 4 dígitos): 11 15…, 351 15…, 2954 15…
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === "15") { d = d.slice(0, area) + d.slice(area + 2); break; }
    }
  }
  return d.length === 10 ? `549${d}` : null;
}

export interface AltaProveedor {
  razonSocial: string;
  cuit: string;
  condicionIva: string;
  cbu: string;
  alias: string;
  banco: string;
  /** A nombre de quién está la cuenta (puede no ser el proveedor). */
  cuentaTitular: string;
  telefono: string;
  rubro: string;
  condicionPago: string;
  plazoDias: string;
  medioPago: string;
  email: string;
  contacto: string;
}

export type ErroresAlta = Partial<Record<keyof AltaProveedor, string>>;

/** Revisa los datos obligatorios (decisión de Adriano 17/11) y el formato de cada uno. */
export function validarAlta(a: AltaProveedor): { errores: ErroresAlta; limpio: AltaProveedor } {
  const errores: ErroresAlta = {};
  const limpio = { ...a };

  if (a.razonSocial.trim().length < 3) errores.razonSocial = "Falta la razón social";
  else limpio.razonSocial = a.razonSocial.trim();

  const cuit = normalizarCuit(a.cuit);
  if (!cuit) errores.cuit = "CUIT inválido (11 dígitos con verificador)";
  else limpio.cuit = cuit;

  if (!(CONDICIONES_IVA as readonly string[]).includes(a.condicionIva)) errores.condicionIva = "Elegí la condición de IVA";

  // La cuenta: CBU o alias (alcanza uno), con el titular de la cuenta (CLAUDE.md: "CBU con
  // titular verificado"). Quien cobra en negro y en efectivo no necesita cuenta.
  const tieneCbu = a.cbu.trim() !== "";
  const tieneAlias = a.alias.trim() !== "";
  if (tieneCbu) {
    const cbu = normalizarCbu(a.cbu);
    if (!cbu) errores.cbu = "CBU o CVU inválido (22 dígitos con verificadores)";
    else limpio.cbu = cbu;
  }
  if (tieneAlias) {
    const alias = normalizarAlias(a.alias);
    if (!alias) errores.alias = "Alias inválido (6 a 20 letras, números, punto o guion)";
    else limpio.alias = alias;
  }
  if (!tieneCbu && !tieneAlias && !cobraSinCuenta(a.condicionIva, a.medioPago)) errores.cbu = "Falta el CBU o el alias";
  if ((tieneCbu || tieneAlias) && a.cuentaTitular.trim().length < 3) errores.cuentaTitular = "Falta a nombre de quién está la cuenta";
  limpio.cuentaTitular = a.cuentaTitular.trim();
  // El banco sale del CBU si no lo escribieron.
  limpio.banco = a.banco.trim() || (limpio.cbu && !errores.cbu ? bancoDelCbu(limpio.cbu) ?? "" : "");

  const tel = normalizarTelefono(a.telefono);
  if (!tel) errores.telefono = "WhatsApp con código de área (al menos 10 dígitos)";
  else limpio.telefono = tel;

  if (a.rubro.trim() === "") errores.rubro = "Elegí el rubro";
  if (a.condicionPago.trim() === "") errores.condicionPago = "Falta la condición de pago";
  if (a.plazoDias.trim() !== "" && !/^\d{1,3}$/.test(a.plazoDias.trim())) errores.plazoDias = "Plazo en días (número)";
  if (!(MEDIOS_PAGO as readonly string[]).includes(a.medioPago)) errores.medioPago = "Elegí el medio de pago";
  if (a.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) errores.email = "Mail inválido";

  return { errores, limpio };
}

/** Próximo código libre: PR-060 si el último es PR-059. */
export function proximoCodigo(codigos: string[]): string {
  const max = codigos.reduce((m, c) => {
    const n = /^PR-(\d+)$/.exec(c);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `PR-${String(max + 1).padStart(3, "0")}`;
}
