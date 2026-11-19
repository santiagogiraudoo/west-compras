"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { procesarEntrada, registrarEntrada, type Resultado } from "@/lib/entrada/procesar";
import { acuse } from "@/lib/entrada/whatsapp";
import { conciliarDespues } from "@/lib/entrada/conciliar.server";

export interface ResultadoSubida {
  ok: boolean;
  mensaje: string;
  id?: string;
  comprobanteId?: string;
}

/**
 * Canal "app" del buzón: el mismo procesador que WhatsApp y el mail (docs/proyecto/09).
 * Se sube un archivo, se lee, se decide y se carga; lo que no pasa solo queda a revisar.
 */
export async function subirAlBuzon(form: FormData): Promise<ResultadoSubida> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") return { ok: false, mensaje: "No tenés permiso para cargar documentos." };
  const f = form.get("archivo");
  if (!(f instanceof File) || f.size === 0) return { ok: false, mensaje: "Elegí la foto o el PDF." };
  const reg = await registrarEntrada({
    canal: "app", nombre: f.name, tipo: f.type, bytes: Buffer.from(await f.arrayBuffer()),
    remitente: session.user.email ?? session.user.name ?? null, remitenteNombre: session.user.name ?? null,
    mensaje: String(form.get("mensaje") ?? "").trim() || null,
  });
  if (!reg.ok) return { ok: false, mensaje: reg.mensaje };
  if (!reg.nuevo) return { ok: false, mensaje: "Ese archivo ya está en el buzón.", id: reg.id };
  const r: Resultado = await procesarEntrada(reg.id);
  await conciliarDespues("proveedor" in r ? r.proveedor : null);
  revalidatePath("/entrada");
  revalidatePath("/bandeja");
  return {
    ok: r.tipo === "cargar_factura" || r.tipo === "cargar_remito" || r.tipo === "comprobante_pago",
    mensaje: acuse(r, { numero: "numero" in r ? r.numero : null }),
    id: reg.id,
    comprobanteId: "comprobanteId" in r ? r.comprobanteId : undefined,
  };
}

/** Volver a procesar algo que quedó a revisar (por ejemplo, después de dar de alta al proveedor). */
export async function reprocesar(id: string): Promise<ResultadoSubida> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") return { ok: false, mensaje: "No tenés permiso." };
  if (!/^\d+$/.test(id)) return { ok: false, mensaje: "Documento inválido." };
  const r = await procesarEntrada(id);
  await conciliarDespues("proveedor" in r ? r.proveedor : null);
  revalidatePath("/entrada");
  revalidatePath("/bandeja");
  return { ok: r.tipo !== "error" && r.tipo !== "revisar", mensaje: acuse(r, { numero: "numero" in r ? r.numero : null }), id };
}
