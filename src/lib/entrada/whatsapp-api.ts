/**
 * Llamadas a la Cloud API de WhatsApp (Meta). Sin las variables de entorno no hace nada:
 * el canal se prende cargando WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en Vercel.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export const WHATSAPP_DISPONIBLE = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

const cabeceras = () => ({ Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` });

/** Baja el archivo de un mensaje: primero se pide su URL y después el contenido. */
export async function bajarMedia(mediaId: string): Promise<Buffer> {
  const meta = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers: cabeceras() });
  if (!meta.ok) throw new Error(`no pude pedir el archivo a WhatsApp (${meta.status})`);
  const { url } = (await meta.json()) as { url?: string };
  if (!url) throw new Error("WhatsApp no devolvió la dirección del archivo");
  const r = await fetch(url, { headers: cabeceras() });
  if (!r.ok) throw new Error(`no pude bajar el archivo de WhatsApp (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

/** Contesta con un texto. Si falla no frena nada: el documento ya quedó en el buzón. */
export async function responder(a: string, texto: string): Promise<boolean> {
  if (!WHATSAPP_DISPONIBLE()) return false;
  const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { ...cabeceras(), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: a, type: "text", text: { body: texto.slice(0, 4000) } }),
  });
  return r.ok;
}
