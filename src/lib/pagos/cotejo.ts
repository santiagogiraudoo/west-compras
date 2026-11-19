import Decimal from "decimal.js";
import { cierra, leerMontoONull } from "@/lib/montos";

/** Lo que se lee de un comprobante de pago (transferencia, echeq, depósito). */
export interface LecturaComprobante {
  /** Importe pagado, con punto decimal ("1587634.15"). */
  monto: string | null;
  /** Fecha del pago, YYYY-MM-DD. */
  fecha: string | null;
  /** N° de operación, transferencia, echeq o comprobante. */
  referencia: string | null;
  medio: "Transferencia" | "Echeq" | "Cheque" | "Efectivo" | "Otros" | null;
  /** CBU, CVU o alias de la cuenta que recibió la plata. */
  cuenta_destino: string | null;
  titular_destino: string | null;
}

export interface Cotejo {
  ok: boolean;
  texto: string;
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * Lo leído contra lo que se espera pagar: el monto contra el neto a transferir (cero
 * tolerancia: menos de $1, como el resto de la app) y la cuenta de destino contra la del
 * proveedor. Solo avisa: quien paga decide.
 */
export function cotejarComprobante(
  l: LecturaComprobante,
  esperado: { neto: string; cbu: string | null; alias: string | null },
): Cotejo[] {
  const out: Cotejo[] = [];
  if (l.monto) {
    let leido: Decimal | null = null;
    // Con leerMontoONull: la IA a veces devuelve "1.587.634,15" y new Decimal no lo leía (no se cotejaba nada).
    const t = leerMontoONull(l.monto);
    leido = t == null ? null : new Decimal(t);
    if (leido) {
      const dif = leido.minus(esperado.neto).abs();
      out.push(cierra(leido, esperado.neto)
        ? { ok: true, texto: "El monto coincide con el neto a transferir" }
        : { ok: false, texto: `El monto del comprobante no coincide con el neto (diferencia $${dif.toDecimalPlaces(0).toNumber().toLocaleString("es-AR", { maximumFractionDigits: 0 })})` });
    }
  }
  if (l.cuenta_destino && (esperado.cbu || esperado.alias)) {
    const dest = l.cuenta_destino.trim();
    // Es un CBU (entero o enmascarado, "***1234") solo si no tiene letras; y coincide si
    // termina igual que el del proveedor. Antes bastaba con que los últimos 6 dígitos
    // aparecieran en cualquier parte del CBU, y un alias con números ("PEREZ.123456")
    // se tomaba por CBU.
    const digDest = soloDigitos(dest);
    const pareceCbu = !/[a-z]/i.test(dest.replace(/x/gi, "")) && digDest.length >= 4;
    const coincideCbu = !!esperado.cbu && pareceCbu && soloDigitos(esperado.cbu).endsWith(digDest.slice(-Math.min(6, digDest.length)));
    const coincideAlias = !!esperado.alias && dest.toLowerCase() === esperado.alias.trim().toLowerCase();
    out.push(coincideCbu || coincideAlias
      ? { ok: true, texto: "La cuenta de destino es la del proveedor" }
      : { ok: false, texto: "La cuenta de destino no es la que tiene cargada el proveedor" });
  }
  return out;
}

export interface OPAPagar {
  numero: string;
  proveedor: string;
  /** Lo que se transfiere: el total de la OP (sin retenciones). */
  total: string;
  cbu: string | null;
  alias: string | null;
}

export type OPDelPago =
  | { tipo: "exacto"; op: OPAPagar }
  | { tipo: "sugerida"; op: OPAPagar; motivo: string }
  | { tipo: "ninguna"; motivo: string };

/**
 * A qué OP autorizada corresponde un comprobante de pago (fase 3: registrar el pago por
 * consecuencia). Exacto: una sola OP con el monto (menos de $1, sin retenciones) y la cuenta del
 * proveedor; ese se registra solo. Si coincide la cuenta pero no el monto (retenciones), o el
 * monto pero no se leyó la cuenta, se sugiere y lo confirma quien paga. Nunca adivina entre dos.
 */
export function elegirOPDelPago(l: LecturaComprobante, ops: OPAPagar[]): OPDelPago {
  const eval_ = ops.map((op) => {
    const c = cotejarComprobante(l, { neto: op.total, cbu: op.cbu, alias: op.alias });
    const monto = c.find((x) => x.texto.startsWith("El monto"));
    const cuenta = c.find((x) => x.texto.startsWith("La cuenta"));
    return { op, monto: monto?.ok === true, cuenta: cuenta?.ok === true, cuentaLeida: !!cuenta };
  });
  const exactos = eval_.filter((e) => e.monto && e.cuenta);
  if (exactos.length === 1) return { tipo: "exacto", op: exactos[0].op };
  if (exactos.length > 1) return { tipo: "ninguna", motivo: `coincide con ${exactos.length} OP por el mismo monto y cuenta: elegí a mano` };
  const porCuenta = eval_.filter((e) => e.cuenta);
  if (porCuenta.length === 1) return { tipo: "sugerida", op: porCuenta[0].op, motivo: "la cuenta es la del proveedor pero el monto no es el total: ¿hubo retenciones?" };
  const porMonto = eval_.filter((e) => e.monto && !e.cuentaLeida);
  if (porMonto.length === 1) return { tipo: "sugerida", op: porMonto[0].op, motivo: "el monto coincide pero no se leyó la cuenta de destino" };
  return { tipo: "ninguna", motivo: "no coincide con ninguna OP autorizada" };
}
