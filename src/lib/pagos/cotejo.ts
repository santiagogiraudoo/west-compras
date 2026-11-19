import Decimal from "decimal.js";
import { cierra } from "@/lib/montos";

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
