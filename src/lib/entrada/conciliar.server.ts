import { prisma } from "@/lib/prisma";
import { mensajeBase } from "@/lib/errores-base";
import { numerosEnTexto, type CompraCruce, type FacturaCruce, type RemitoCruce } from "./cruce";
import { planConciliar, type AccionConciliar, type EstadoProveedor } from "./conciliar";
import { guardarCompra } from "./procesar";

/**
 * Ejecuta el conciliador (conciliar.ts) contra la base: lee lo abierto, arma el plan y, con
 * `aplicar`, lo hace con las funciones de la base (cc.ligar_remito, cc.cargar_compras), un
 * proveedor por transacción. Corre después de cada documento del Buzón (para su proveedor) y
 * una vez por día para todos (/api/conciliar), así también agarra lo que carga el plomero.
 */

/** Desde cuándo un remito sin compra crea la suya: antes no había compras cargadas. */
export const DESDE_COMPRAS = process.env.CONCILIAR_COMPRAS_DESDE ?? "2026-11-01";

export interface ResultadoConciliar {
  acciones: (AccionConciliar & { proveedor: string; hecho?: boolean; error?: string })[];
  proveedores: number;
}

type Db = Pick<typeof prisma, "$queryRaw">;

async function leerEstado(db: Db, proveedor: string | null, desdeCompras: string): Promise<EstadoProveedor[]> {
  const filtro = proveedor ?? null;
  const [facturas, remitos, compras] = await Promise.all([
    db.$queryRaw<(FacturaCruce & { proveedor: string })[]>`
      select c.id::text, c.proveedor_codigo as proveedor, c.numero, c.fecha::text, c.total::text, c.descripcion
      from cc.comprobantes c
      where (${filtro}::text is null or c.proveedor_codigo = ${filtro}) and c.tipo not ilike 'nota de%'
        and c.estado_aprobacion <> 'Anulado' and c.fecha >= current_date - 180 and c.total > 0
        and not exists (select 1 from cc.remitos r where r.comprobante_id = c.id and r.estado <> 'anulado')`,
    db.$queryRaw<(RemitoCruce & { proveedor: string; sin_factura: boolean; sin_compra: boolean })[]>`
      select r.id::text, r.proveedor_codigo as proveedor, r.numero, r.fecha::text, r.importe::text,
        coalesce((select array_agg(x) from app.entrada e, jsonb_array_elements_text(e.lectura->'remito'->'facturas_citadas') x
          where e.remito_id = r.id), '{}') as facturas_citadas,
        r.comprobante_id is null as sin_factura, r.compra_id is null as sin_compra
      from cc.remitos r
      where (${filtro}::text is null or r.proveedor_codigo = ${filtro}) and r.estado <> 'anulado'
        and (r.comprobante_id is null or (r.compra_id is null and r.fecha >= ${desdeCompras}::date))`,
    db.$queryRaw<(Omit<CompraCruce, "numero"> & { proveedor: string; nombre: string })[]>`
      select id::text, clickup_id as clave, proveedor_codigo as proveedor, nombre, fecha::text, importe::text, estado
      from cc.compras
      where (${filtro}::text is null or proveedor_codigo = ${filtro}) and proveedor_codigo is not null
        and estado <> 'descartado' and fecha >= current_date - 180`,
  ]);
  const por = new Map<string, EstadoProveedor>();
  const de = (p: string) => por.get(p) ?? por.set(p, { proveedor: p, facturasSinRemito: [], remitosSinFactura: [], remitosSinCompra: [], compras: [] }).get(p)!;
  for (const { proveedor: p, ...f } of facturas) de(p).facturasSinRemito.push(f);
  for (const { proveedor: p, sin_factura, sin_compra, ...r } of remitos) {
    if (sin_factura) de(p).remitosSinFactura.push(r);
    if (sin_compra) de(p).remitosSinCompra.push(r);
  }
  for (const { proveedor: p, nombre, ...k } of compras) de(p).compras.push({ ...k, numero: numerosEnTexto(nombre)[0] ?? null });
  return [...por.values()];
}

/**
 * Después de que entra un documento: concilia ese proveedor. Nunca hace fallar a quien llama
 * (el documento ya quedó cargado); si algo falla, lo agarra la corrida diaria.
 */
export async function conciliarDespues(proveedor: string | null | undefined): Promise<number> {
  if (!proveedor) return 0;
  try {
    const r = await conciliar({ proveedor, aplicar: true });
    return r.acciones.filter((a) => a.hecho).length;
  } catch (e) {
    console.error("conciliar después de cargar:", proveedor, e);
    return 0;
  }
}

export async function conciliar(op: { proveedor?: string | null; aplicar: boolean; desdeCompras?: string }): Promise<ResultadoConciliar> {
  const desde = op.desdeCompras ?? DESDE_COMPRAS;
  const estados = await leerEstado(prisma, op.proveedor ?? null, desde);
  const acciones: ResultadoConciliar["acciones"] = [];
  for (const e of estados) {
    const plan = planConciliar(e, desde);
    if (!plan.length) continue;
    if (!op.aplicar) { acciones.push(...plan.map((a) => ({ ...a, proveedor: e.proveedor }))); continue; }
    const claves = new Map(e.compras.map((k) => [k.id, k.clave]));
    try {
      await prisma.$transaction(async (tx) => {
        for (const a of plan) {
          if (a.tipo === "ligar_factura") {
            await tx.$executeRaw`select cc.ligar_remito(${BigInt(a.remito)}, ${BigInt(a.factura)})`;
          } else if (a.tipo === "atar_compra") {
            await guardarCompra(tx, { clave: claves.get(a.compra)!, estado: "esperando remito", remitos: [Number(a.remito)] });
          } else {
            const [r] = await tx.$queryRaw<{ numero: string | null; fecha: string | null; importe: string | null; estado: string; autorizo: string | null; unidad: string | null }[]>`
              select r.numero, r.fecha::text, r.importe::text, r.estado, r.autorizo, c.unidad_codigo as unidad
              from cc.remitos r left join cc.comprobantes c on c.id = r.comprobante_id where r.id = ${BigInt(a.remito)}`;
            await guardarCompra(tx, {
              clave: `app:remito-${a.remito}`, nombre: `Remito ${r.numero ?? "s/n"}`, proveedor: e.proveedor, unidad: r.unidad,
              importe: r.importe, autorizo: r.autorizo, fecha: r.fecha, estado: r.estado === "ok" ? "hecho" : "esperando remito",
              remitos: [Number(a.remito)],
            });
          }
        }
      });
      acciones.push(...plan.map((a) => ({ ...a, proveedor: e.proveedor, hecho: true })));
    } catch (err) {
      // Un proveedor que falla no frena a los demás: queda anotado y se reintenta la próxima vez.
      const error = mensajeBase(err instanceof Error ? err.message : String(err));
      acciones.push(...plan.map((a) => ({ ...a, proveedor: e.proveedor, hecho: false, error })));
    }
  }
  return { acciones, proveedores: estados.length };
}
