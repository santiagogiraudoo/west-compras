import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { LECTURA_DISPONIBLE } from "@/lib/pagos/leer-comprobante";
import type { LecturaFactura } from "./lectura";

/**
 * Lee una factura (PDF o foto) con la API de Claude para precargar "Añadir factura" de la
 * Bandeja. Mismo esquema y mismas reglas que el lector del plomero (documentos.py): solo
 * lo que se ve, montos con punto decimal, lo que no se lee va null y a "dudas". Quien la
 * carga revisa y completa: esto no guarda nada.
 */
const Item = z.object({
  descripcion: z.string(),
  cantidad: z.string().nullable(),
  precio_unitario: z.string().nullable(),
  subtotal: z.string().nullable(),
});
const Lectura = z.object({
  es_factura: z.boolean(),
  cuit_emisor: z.string().nullable(),
  razon_social: z.string().nullable(),
  tipo: z.enum(["FA", "NC", "ND"]).nullable(),
  letra: z.string().nullable(),
  punto_venta: z.string().nullable(),
  numero: z.string().nullable(),
  fecha: z.string().nullable(),
  vencimiento: z.string().nullable(),
  cuit_receptor: z.string().nullable(),
  neto: z.string().nullable(),
  iva: z.string().nullable(),
  percepciones: z.string().nullable(),
  total: z.string().nullable(),
  moneda: z.string().nullable(),
  items: z.array(Item),
  dudas: z.array(z.string()),
});

const INSTRUCCIONES = `Es un comprobante de un proveedor argentino (factura, nota de crédito o nota de débito).
Devolvé SOLO lo que se ve, sin adivinar:
- cuit_emisor y cuit_receptor con guiones si figuran (ej. "30-70918981-2"); razon_social del emisor.
- tipo: FA (factura), NC (nota de crédito) o ND (nota de débito); letra: A, B, C, M o X.
- punto_venta y numero tal como figuran (ej. "00003" y "00008897").
- fecha y vencimiento en formato AAAA-MM-DD.
- neto, iva, percepciones (suma de percepciones y otros impuestos) y total: con punto decimal y sin separador de miles (ej. "1234567.89").
- moneda: PES si es en pesos, DOL si es en dólares, otra sigla si figura; null si no dice.
- vencimiento es el de PAGO; el "vencimiento del CAE" no es el vencimiento de la factura.
- items: cada renglón con descripcion, cantidad, precio_unitario y subtotal.
Si un dato no está o no se lee seguro, va null y lo contás en "dudas" en pocas palabras (ej. "fecha borrosa").
Si no es una factura, nota de crédito ni nota de débito (un remito, un presupuesto, un comprobante de pago), es_factura va false.`;

export type ResultadoLecturaFactura = { ok: true; lectura: LecturaFactura } | { ok: false; mensaje: string };

export async function leerFactura(bytes: Buffer, tipo: string): Promise<ResultadoLecturaFactura> {
  if (!LECTURA_DISPONIBLE()) {
    return { ok: false, mensaje: "La lectura con IA se activa cuando esté cargada la clave de Claude. Completá los datos a mano." };
  }
  const data = bytes.toString("base64");
  const archivo: Anthropic.Beta.BetaContentBlockParam = tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: tipo as "image/jpeg" | "image/png" | "image/webp", data } };
  const client = new Anthropic();
  try {
    const r = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Extracción: poco esfuerzo alcanza y responde rápido.
      output_config: { effort: "low", format: betaZodOutputFormat(Lectura) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: [archivo, { type: "text", text: INSTRUCCIONES }] }],
    });
    if (r.stop_reason === "refusal" || !r.parsed_output) return { ok: false, mensaje: "No se pudo leer la factura. Completá los datos a mano." };
    if (!r.parsed_output.es_factura) return { ok: false, mensaje: "El archivo no parece una factura (¿un remito o un comprobante de pago?)." };
    return { ok: true, lectura: r.parsed_output };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, mensaje: "La lectura está ocupada; probá en un rato o completá a mano." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, mensaje: "La clave de Claude no es válida. Completá los datos a mano." };
    if (e instanceof Anthropic.APIError) return { ok: false, mensaje: "No se pudo leer la factura. Completá los datos a mano." };
    throw e;
  }
}
