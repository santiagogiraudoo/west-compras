import { createHmac, timingSafeEqual } from "node:crypto";
import type { Accion } from "./decidir";

/**
 * Canal WhatsApp Business (Cloud API de Meta): lo que llega al webhook /api/whatsapp y lo que
 * se contesta. Puro: las llamadas a la API de Meta están en whatsapp-api.ts.
 */

export const TIPOS_ACEPTADOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export interface MensajeWa {
  /** id del mensaje (wamid…): el reintento del webhook trae el mismo y no se duplica. */
  id: string;
  /** Teléfono de quien lo manda, como lo da WhatsApp (5493511234567). */
  de: string;
  nombre: string | null;
  /** Archivo adjunto (foto o PDF); null si es solo texto. */
  media: { id: string; mime: string; nombreArchivo: string | null } | null;
  /** Texto del mensaje o el epígrafe de la foto ("es para West Club"). */
  texto: string | null;
}

/**
 * La firma que manda Meta en X-Hub-Signature-256 ("sha256=<hex>"): HMAC del cuerpo crudo con el
 * secreto de la app. Sin firma válida no se procesa nada (cualquiera puede pegarle al webhook).
 */
export function firmaValida(cuerpo: string, firma: string | null, secreto: string): boolean {
  if (!firma?.startsWith("sha256=") || !secreto) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpo, "utf8").digest();
  const recibida = Buffer.from(firma.slice(7), "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

type Json = Record<string, unknown>;
const obj = (x: unknown): Json => (x && typeof x === "object" ? (x as Json) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);

/** Los mensajes de un aviso del webhook. Lo que no es un mensaje (estados de entrega, etc.) se ignora. */
export function leerWebhook(cuerpo: unknown): MensajeWa[] {
  const out: MensajeWa[] = [];
  for (const entry of arr(obj(cuerpo).entry)) {
    for (const change of arr(obj(entry).changes)) {
      const value = obj(obj(change).value);
      const contactos = new Map(arr(value.contacts).map((c) => [str(obj(c).wa_id), str(obj(obj(c).profile).name)]));
      for (const m of arr(value.messages)) {
        const msg = obj(m);
        const id = str(msg.id);
        const de = str(msg.from);
        if (!id || !de) continue;
        const tipo = str(msg.type);
        const adj = tipo === "image" || tipo === "document" ? obj(msg[tipo]) : null;
        const media = adj && str(adj.id) && str(adj.mime_type)
          ? { id: str(adj.id)!, mime: str(adj.mime_type)!.split(";")[0].trim(), nombreArchivo: str(adj.filename) }
          : null;
        const texto = tipo === "text" ? str(obj(msg.text).body) : adj ? str(adj.caption) : null;
        out.push({ id, de, nombre: contactos.get(de) ?? null, media, texto });
      }
    }
  }
  return out;
}

/** Lo que se le contesta a quien mandó el documento, en una línea. */
export function acuse(a: Accion | { tipo: "error"; motivo: string } | { tipo: "repetido" }, extra?: { numero?: string | null }): string {
  switch (a.tipo) {
    case "cargar_factura": return `Recibida la factura ${a.numero}. Queda para aprobar.${a.avisos.length ? " Hay cosas para revisar: te avisamos si falta algo." : ""}`;
    case "cargar_remito": return `Recibido el remito${extra?.numero ? ` ${extra.numero}` : ""}.${a.avisos.length ? ` Ojo: ${a.avisos.join("; ").toLowerCase()}.` : ""}`;
    case "comprobante_pago": return "Recibido el comprobante de pago.";
    case "duplicado": return `Ya lo teníamos: ${a.motivo}.`;
    case "repetido": return "Ese archivo ya lo habías mandado.";
    case "revisar": return `Lo recibimos, pero hay que revisarlo a mano: ${a.motivo}.`;
    case "descartar": return `No lo pudimos tomar: ${a.motivo}. Mandá la factura o el remito (foto clara o PDF).`;
    case "error": return `No lo pudimos leer: ${a.motivo}. Probá con una foto más clara o el PDF.`;
  }
}
