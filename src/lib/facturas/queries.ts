import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requisitosFactura, type Requisitos } from "./requisitos";

/** Desde cuándo mira la bandeja: lo anterior es la carga histórica de la migración. */
export const DESDE = new Date("2026-10-01");

const PROVEEDOR_SELECT = {
  codigo: true, razon_social: true, cuit: true, cbu_alias: true, condicion_iva: true,
  telefono: true, rubro: true, condicion_pago: true,
} as const;

export interface FilaBandeja {
  id: string;
  proveedor: string;
  tipo: string;
  numero: string;
  fecha: Date;
  total: number;
  estado: string | null;
  requisitos: Requisitos;
}

/**
 * La bandeja: solo lo que no pasó solo (Adriano 17/11).
 * - Pendientes: nadie las aprobó todavía.
 * - Aprobadas a las que les falta algo que frena (unidad, rubro, titular, PDF, total).
 * Las aprobadas sin remito de antes NO entran: ya se aprobaron como excepción.
 */
export async function listarBandeja(): Promise<FilaBandeja[]> {
  const comprobantes = await prisma.comprobante.findMany({
    where: { fecha: { gte: DESDE }, estado_aprobacion: { notIn: ["Anulado", "Factura de remitos"] } },
    orderBy: [{ fecha: "desc" }],
  });
  const ids = comprobantes.map((c) => c.id);
  const [proveedores, remitos] = await Promise.all([
    prisma.proveedor.findMany({ select: PROVEEDOR_SELECT }),
    prisma.remito.findMany({ where: { comprobante_id: { in: ids } }, select: { comprobante_id: true } }),
  ]);
  const prov = new Map(proveedores.map((p) => [p.codigo, p]));
  const conRemito = new Set(remitos.map((r) => String(r.comprobante_id)));

  return comprobantes
    .map((c) => ({
      id: String(c.id),
      proveedor: prov.get(c.proveedor_codigo)?.razon_social ?? c.proveedor_codigo,
      tipo: c.tipo,
      numero: c.numero,
      fecha: c.fecha,
      total: new Decimal(c.total.toString()).toNumber(),
      estado: c.estado_aprobacion,
      requisitos: requisitosFactura(
        { ...c, tieneRemito: conRemito.has(String(c.id)) || !!c.retiro_por },
        prov.get(c.proveedor_codigo) ?? null,
      ),
    }))
    .filter((f) => f.estado === "Pendiente" || f.requisitos.faltan.length > 0);
}

export async function obtenerFactura(id: bigint) {
  const c = await prisma.comprobante.findUnique({
    where: { id },
    include: { items: { orderBy: { orden: "asc" } } },
  });
  if (!c) return null;
  const [proveedor, remitos] = await Promise.all([
    prisma.proveedor.findUnique({ where: { codigo: c.proveedor_codigo }, select: PROVEEDOR_SELECT }),
    prisma.remito.findMany({ where: { comprobante_id: c.id }, orderBy: { fecha: "asc" } }),
  ]);
  const requisitos = requisitosFactura({ ...c, tieneRemito: remitos.length > 0 || !!c.retiro_por }, proveedor);
  return { c, proveedor, remitos, requisitos };
}

/** Listas cerradas de la base: lo que no está acá, la base lo rechaza. */
export async function listasDeCarga() {
  const [unidades, rubros, titulares] = await Promise.all([
    prisma.unidad.findMany({ where: { activa: true }, orderBy: { codigo: "asc" } }),
    prisma.$queryRaw<{ nombre: string }[]>`select nombre from cc.rubros where activo order by nombre`,
    prisma.$queryRaw<{ nombre: string }[]>`select nombre from cc.titulares where activo order by nombre`,
  ]);
  return {
    unidades: unidades.map((u) => ({ value: u.codigo, label: `${u.codigo} · ${u.nombre}` })),
    rubros: rubros.map((r) => r.nombre),
    titulares: titulares.map((t) => t.nombre),
  };
}
