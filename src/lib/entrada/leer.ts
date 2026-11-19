import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { LecturaFacturaZ } from "@/lib/facturas/leer-factura";
import { LECTURA_DISPONIBLE } from "@/lib/pagos/leer-comprobante";
import { CLASES, type LecturaEntrada } from "./decidir";

/**
 * Lectura del buzón: una sola llamada a Claude que dice qué es el documento (factura, NC, ND,
 * remito, comprobante de pago u otro) y extrae lo suyo, con el contrato de lectura común a la
 * app y al plomero (docs/proyecto/07_ia_y_plomero.md): structured outputs, null en vez de
 * inventar, montos con punto decimal. No guarda nada: eso lo hace procesar.ts.
 */

const RemitoZ = z.object({
  numero: z.string().nullable(),
  fecha: z.string().nullable(),
  facturas_citadas: z.array(z.string()),
  retira: z.string().nullable(),
  autoriza: z.string().nullable(),
  destino: z.string().nullable(),
  importe: z.string().nullable(),
  firmado: z.boolean(),
});

const EntradaZ = z.object({
  clase: z.enum(CLASES),
  cuit_emisor: z.string().nullable(),
  razon_social: z.string().nullable(),
  factura: LecturaFacturaZ.nullable(),
  remito: RemitoZ.nullable(),
  dudas: z.array(z.string()),
});

const INSTRUCCIONES = `Es un documento que un proveedor, un encargado o un contratista mandó a una empresa argentina que compra materiales y servicios.
Primero decí qué es en "clase":
- factura, nota_credito o nota_debito: comprobante fiscal (tiene punto de venta, número y CAE o letra A/B/C/M). Un comprobante "X" o "no válido como factura" NO es factura: es remito.
- remito: remito, nota de entrega o factura firmada en conformidad de recepción.
- comprobante_pago: transferencia, echeq, cheque o depósito.
- otro: presupuesto, planilla, foto de mercadería o cualquier otra cosa.
Devolvé SOLO lo que se ve, sin adivinar. Lo que no está o no se lee seguro va null y lo contás en "dudas" en pocas palabras.
- cuit_emisor (con guiones si figuran) y razon_social: de quien emite el documento.
- Si es factura, nota de crédito o de débito, completá "factura" (y "remito" en null):
  tipo FA, NC o ND; letra; punto_venta y numero tal como figuran; fecha y vencimiento de PAGO en AAAA-MM-DD (el vencimiento del CAE no es el de la factura);
  neto, iva, percepciones (percepciones + otros tributos) y total con punto decimal y sin separador de miles ("1234567.89");
  moneda PES, DOL u otra sigla (null si no dice); items con descripcion, cantidad, precio_unitario y subtotal; es_factura true.
- Si es remito, completá "remito" (y "factura" en null): numero; fecha AAAA-MM-DD; facturas_citadas (números de factura o presupuesto que figuren, "PPPP-NNNNNNNN");
  retira: el nombre ESCRITO de quien recibió (el nombre a mano junto a "Chofer:" en corralones es de quien recibió); autoriza; destino (obra, dirección o unidad);
  importe total si figura; firmado true si hay firma o aclaración de quien recibió. No adivines nombres por una firma.
- Si es comprobante de pago u otro, "factura" y "remito" van null.`;

export type ResultadoLecturaEntrada = { ok: true; lectura: LecturaEntrada } | { ok: false; mensaje: string };

export async function leerDocumento(bytes: Buffer, tipo: string): Promise<ResultadoLecturaEntrada> {
  if (!LECTURA_DISPONIBLE()) return { ok: false, mensaje: "falta la clave de Claude para leer documentos" };
  const data = bytes.toString("base64");
  const archivo: Anthropic.Beta.BetaContentBlockParam = tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: tipo as "image/jpeg" | "image/png" | "image/webp", data } };
  try {
    const r = await new Anthropic().beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Clasificar y extraer: poco esfuerzo alcanza y responde rápido.
      output_config: { effort: "low", format: betaZodOutputFormat(EntradaZ) },
      // Si el modelo declina, la API reintenta sola con el que corresponda.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: [archivo, { type: "text", text: INSTRUCCIONES }] }],
    });
    if (r.stop_reason === "refusal") return { ok: false, mensaje: "Claude no quiso leer el documento" };
    if (r.stop_reason === "max_tokens") return { ok: false, mensaje: "la lectura vino cortada (documento demasiado largo)" };
    if (!r.parsed_output) return { ok: false, mensaje: "la lectura no vino con el formato esperado" };
    return { ok: true, lectura: r.parsed_output };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, mensaje: "la lectura está ocupada; se reintenta más tarde" };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, mensaje: "la clave de Claude no es válida" };
    if (e instanceof Anthropic.APIError) return { ok: false, mensaje: `error de la API de Claude (${e.status ?? "sin código"})` };
    throw e;
  }
}
