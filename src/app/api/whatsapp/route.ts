import { after } from "next/server";
import { acuse, firmaValida, leerWebhook, TIPOS_ACEPTADOS } from "@/lib/entrada/whatsapp";
import { bajarMedia, responder, WHATSAPP_DISPONIBLE } from "@/lib/entrada/whatsapp-api";
import { procesarEntrada, registrarEntrada } from "@/lib/entrada/procesar";

/**
 * Webhook del número de WhatsApp Business (docs/proyecto/09_flujo_entrada.md). No pide sesión
 * (lo llama Meta): se protege con la firma X-Hub-Signature-256. Contesta 200 enseguida y procesa
 * después (after): Meta reintenta si tarda, y el id del mensaje evita cargarlo dos veces.
 */

// Verificación del webhook cuando se configura en Meta.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("No autorizado", { status: 403 });
}

export async function POST(req: Request) {
  const cuerpo = await req.text();
  const secreto = process.env.WHATSAPP_APP_SECRET ?? "";
  if (!WHATSAPP_DISPONIBLE() || !firmaValida(cuerpo, req.headers.get("x-hub-signature-256"), secreto)) {
    return new Response("No autorizado", { status: 401 });
  }
  let json: unknown;
  try { json = JSON.parse(cuerpo); } catch { return new Response("JSON inválido", { status: 400 }); }

  const mensajes = leerWebhook(json);
  after(async () => {
    for (const m of mensajes) {
      if (!m.media) continue; // solo texto: no hay documento que procesar
      if (!(TIPOS_ACEPTADOS as readonly string[]).includes(m.media.mime)) {
        await responder(m.de, "Mandá la factura o el remito como foto (JPG o PNG) o PDF.");
        continue;
      }
      try {
        const bytes = await bajarMedia(m.media.id);
        const ext = m.media.mime === "application/pdf" ? "pdf" : m.media.mime.split("/")[1];
        const reg = await registrarEntrada({
          canal: "whatsapp", nombre: m.media.nombreArchivo ?? `whatsapp-${m.id.slice(-8)}.${ext}`, tipo: m.media.mime, bytes,
          remitente: m.de, remitenteNombre: m.nombre, mensaje: m.texto, externoId: m.id,
        });
        if (!reg.ok) { await responder(m.de, acuse({ tipo: "error", motivo: reg.mensaje })); continue; }
        if (!reg.nuevo) { await responder(m.de, acuse({ tipo: "repetido" })); continue; }
        const r = await procesarEntrada(reg.id);
        await responder(m.de, acuse(r, { numero: "numero" in r ? r.numero : null }));
      } catch (e) {
        console.error("whatsapp: no pude procesar", m.id, e);
        await responder(m.de, acuse({ tipo: "error", motivo: "hubo un problema de nuestro lado; lo revisamos" }));
      }
    }
  });
  return new Response("ok", { status: 200 });
}
