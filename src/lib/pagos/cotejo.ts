import Decimal from "decimal.js";

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
    try { leido = new Decimal(l.monto); } catch { leido = null; }
    if (leido) {
      const dif = leido.minus(esperado.neto).abs();
      out.push(dif.lt(1)
        ? { ok: true, texto: "El monto coincide con el neto a transferir" }
        : { ok: false, texto: `El monto del comprobante no coincide con el neto (diferencia $${dif.toDecimalPlaces(0).toNumber().toLocaleString("es-AR", { maximumFractionDigits: 0 })})` });
    }
  }
  if (l.cuenta_destino && (esperado.cbu || esperado.alias)) {
    const dest = l.cuenta_destino.trim();
    const coincideCbu = !!esperado.cbu && soloDigitos(dest).length >= 6 && soloDigitos(esperado.cbu).includes(soloDigitos(dest).slice(-6));
    const coincideAlias = !!esperado.alias && dest.toLowerCase() === esperado.alias.trim().toLowerCase();
    out.push(coincideCbu || coincideAlias
      ? { ok: true, texto: "La cuenta de destino es la del proveedor" }
      : { ok: false, texto: "La cuenta de destino no es la que tiene cargada el proveedor" });
  }
  return out;
}
