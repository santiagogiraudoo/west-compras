import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { LecturaComprobante } from "./cotejo";

/**
 * Lee un comprobante de pago (PDF o foto) con la API de Claude y devuelve los datos para
 * precargar "Registrar pago". Quien paga revisa y confirma: esto solo completa campos.
 * Sin credenciales de Anthropic (ANTHROPIC_API_KEY) no lee y lo dice.
 */

const Lectura = z.object({
  es_comprobante_de_pago: z.boolean(),
  monto: z.string().nullable(),
  fecha: z.string().nullable(),
  referencia: z.string().nullable(),
  medio: z.enum(["Transferencia", "Echeq", "Cheque", "Efectivo", "Otros"]).nullable(),
  cuenta_destino: z.string().nullable(),
  titular_destino: z.string().nullable(),
});

const INSTRUCCIONES = `Es un comprobante de un pago a un proveedor en Argentina (transferencia, echeq, cheque o depósito).
Extraé los datos tal como figuran, sin inventar:
- monto: el importe pagado, con punto decimal y sin separador de miles (ej. "1587634.15").
- fecha: la fecha del pago en formato YYYY-MM-DD.
- referencia: el número de operación, de transferencia, de echeq o de comprobante.
- medio: Transferencia, Echeq, Cheque, Efectivo u Otros.
- cuenta_destino: el CBU, CVU o alias de la cuenta que recibió la plata.
- titular_destino: a nombre de quién está esa cuenta.
Si un dato no está o no se lee, va null. Si no es un comprobante de pago, es_comprobante_de_pago va false.`;

export type ResultadoLectura =
  | { ok: true; datos: LecturaComprobante }
  | { ok: false; mensaje: string };

export const LECTURA_DISPONIBLE = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export async function leerComprobante(bytes: Buffer, tipo: string): Promise<ResultadoLectura> {
  if (!LECTURA_DISPONIBLE()) {
    return { ok: false, mensaje: "La lectura automática se activa cuando esté cargada la clave de Claude. Completá los datos a mano." };
  }
  const data = bytes.toString("base64");
  const archivo: Anthropic.Beta.BetaContentBlockParam = tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: tipo as "image/jpeg" | "image/png", data } };

  const client = new Anthropic();
  try {
    const r = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Extracción simple: poco esfuerzo alcanza y responde rápido.
      output_config: { effort: "low", format: betaZodOutputFormat(Lectura) },
      // Si el modelo declina, la API reintenta sola con el modelo que corresponda.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: [archivo, { type: "text", text: INSTRUCCIONES }] }],
    });
    if (r.stop_reason === "refusal") return { ok: false, mensaje: "No se pudo leer el comprobante. Completá los datos a mano." };
    const p = r.parsed_output;
    if (!p) return { ok: false, mensaje: "No se pudo leer el comprobante. Completá los datos a mano." };
    if (!p.es_comprobante_de_pago) return { ok: false, mensaje: "El archivo no parece un comprobante de pago." };
    const { monto, fecha, referencia, medio, cuenta_destino, titular_destino } = p;
    return { ok: true, datos: { monto, fecha, referencia, medio, cuenta_destino, titular_destino } };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, mensaje: "La lectura está ocupada; probá de nuevo en un rato o completá a mano." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, mensaje: "La clave de Claude no es válida. Completá los datos a mano." };
    if (e instanceof Anthropic.APIError) return { ok: false, mensaje: "No se pudo leer el comprobante. Completá los datos a mano." };
    throw e;
  }
}
