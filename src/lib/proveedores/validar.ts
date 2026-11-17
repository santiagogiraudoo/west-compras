/**
 * Validaciones del alta de proveedor. Puras, sin base, para usarlas igual en el
 * formulario y en el server.
 */

export const CONDICIONES_IVA = ["Responsable Inscripto", "Monotributo", "Exento", "En negro (sin factura)"] as const;
export const MEDIOS_PAGO = ["Transferencia", "Echeq", "Cheque", "Efectivo"] as const;

const soloDigitos = (s: string) => s.replace(/\D/g, "");

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

/**
 * CBU (22 dígitos con sus dos verificadores) o alias (6 a 20 caracteres: letras,
 * números, punto y guion). Devuelve el valor limpio o null.
 */
export function normalizarCbuAlias(entrada: string): string | null {
  const s = entrada.trim();
  const d = soloDigitos(s);
  if (/^[\d\s-]+$/.test(s)) {
    if (d.length !== 22) return null;
    const ok = (bloque: string, pesos: number[]) => {
      const suma = pesos.reduce((acc, p, i) => acc + p * Number(bloque[i]), 0);
      return (10 - (suma % 10)) % 10 === Number(bloque[pesos.length]);
    };
    if (!ok(d.slice(0, 8), [7, 1, 3, 9, 7, 1, 3])) return null;
    if (!ok(d.slice(8), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])) return null;
    return d;
  }
  if (/^[A-Za-z0-9.-]{6,20}$/.test(s)) return s.toUpperCase();
  return null;
}

/** WhatsApp: al menos 10 dígitos (código de área + número). Se guarda solo con dígitos. */
export function normalizarTelefono(entrada: string): string | null {
  const d = soloDigitos(entrada);
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export interface AltaProveedor {
  razonSocial: string;
  cuit: string;
  condicionIva: string;
  cbuAlias: string;
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

  // Quien cobra en negro no necesita CBU si se le paga en efectivo.
  const sinCbuValido = a.condicionIva === "En negro (sin factura)" && a.medioPago === "Efectivo";
  if (a.cbuAlias.trim() === "" && !sinCbuValido) errores.cbuAlias = "Falta el CBU o alias";
  else if (a.cbuAlias.trim() !== "") {
    const cbu = normalizarCbuAlias(a.cbuAlias);
    if (!cbu) errores.cbuAlias = "CBU (22 dígitos) o alias (6 a 20 letras, números, punto o guion) inválido";
    else limpio.cbuAlias = cbu;
  }

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
