"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mensajeBase } from "@/lib/errores-base";
import { guardarCompra } from "@/lib/entrada/procesar";

export interface Resultado {
  ok: boolean;
  mensaje: string;
}

/**
 * Atar a mano lo que no cruzó solo (docs/proyecto/09_flujo_entrada.md): remito ↔ factura y
 * remito ↔ compra. Siempre con las funciones de la base (cc.ligar_remito, cc.cargar_compras),
 * que frenan lo que no puede ser: otro proveedor, un remito ya atado a otra factura o compra.
 */

async function puede(): Promise<string | null> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") return null;
  return session.user.name ?? "app";
}

const ok = (mensaje: string, factura?: string): Resultado => {
  revalidatePath("/compras");
  revalidatePath("/bandeja");
  if (factura) revalidatePath(`/bandeja/${factura}`);
  return { ok: true, mensaje };
};
const fallo = (e: unknown): Resultado => ({ ok: false, mensaje: `La base lo rechazó: ${mensajeBase(e instanceof Error ? e.message : String(e))}` });
const esId = (x: string) => /^\d+$/.test(x);

/** Este remito es de esta factura. */
export async function atarRemitoAFactura(remitoId: string, facturaId: string): Promise<Resultado> {
  if (!(await puede())) return { ok: false, mensaje: "No tenés permiso." };
  if (!esId(remitoId) || !esId(facturaId)) return { ok: false, mensaje: "Datos inválidos." };
  try {
    await prisma.$executeRaw`select cc.ligar_remito(${BigInt(remitoId)}, ${BigInt(facturaId)})`;
    return ok("Remito atado a la factura.", facturaId);
  } catch (e) { return fallo(e); }
}

/** Este remito es de esta compra (la compra queda esperando el resto o entregada). */
export async function atarRemitoACompra(remitoId: string, compraId: string, facturaId?: string): Promise<Resultado> {
  if (!(await puede())) return { ok: false, mensaje: "No tenés permiso." };
  if (!esId(remitoId) || !esId(compraId)) return { ok: false, mensaje: "Datos inválidos." };
  try {
    await prisma.$transaction(async (tx) => {
      const [k] = await tx.$queryRaw<{ clave: string; proveedor: string | null }[]>`
        select clickup_id as clave, proveedor_codigo as proveedor from cc.compras where id = ${BigInt(compraId)}`;
      const [r] = await tx.$queryRaw<{ proveedor: string }[]>`select proveedor_codigo as proveedor from cc.remitos where id = ${BigInt(remitoId)}`;
      if (!k || !r) throw new Error("no existe la compra o el remito");
      if (k.proveedor && k.proveedor !== r.proveedor) throw new Error(`la compra es de ${k.proveedor} y el remito de ${r.proveedor}`);
      await guardarCompra(tx, { clave: k.clave, estado: "esperando remito", remitos: [Number(remitoId)] });
    });
    return ok("Remito atado a la compra.", facturaId);
  } catch (e) { return fallo(e); }
}

/** No hay compra para este remito: se crea con lo que dice el remito ("la compra entra con el remito"). */
export async function crearCompraDesdeRemito(remitoId: string, facturaId?: string): Promise<Resultado> {
  const quien = await puede();
  if (!quien) return { ok: false, mensaje: "No tenés permiso." };
  if (!esId(remitoId)) return { ok: false, mensaje: "Datos inválidos." };
  try {
    await prisma.$transaction(async (tx) => {
      const [r] = await tx.$queryRaw<{ proveedor: string; numero: string | null; fecha: string | null; importe: string | null; estado: string; autorizo: string | null; compra: string | null; unidad: string | null }[]>`
        select r.proveedor_codigo as proveedor, r.numero, r.fecha::text, r.importe::text, r.estado, r.autorizo, r.compra_id::text as compra,
          c.unidad_codigo as unidad
        from cc.remitos r left join cc.comprobantes c on c.id = r.comprobante_id where r.id = ${BigInt(remitoId)}`;
      if (!r) throw new Error("no existe el remito");
      if (r.compra) throw new Error("el remito ya tiene compra");
      await guardarCompra(tx, {
        clave: `app:remito-${remitoId}`, nombre: `Remito ${r.numero ?? "s/n"} (compra creada a mano por ${quien})`, proveedor: r.proveedor,
        unidad: r.unidad, importe: r.importe, autorizo: r.autorizo, fecha: r.fecha,
        estado: r.estado === "ok" ? "hecho" : "esperando remito", remitos: [Number(remitoId)],
      });
    });
    return ok("Compra creada desde el remito.", facturaId);
  } catch (e) { return fallo(e); }
}
