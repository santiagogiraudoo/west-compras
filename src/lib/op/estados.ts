import Decimal from "decimal.js";

/**
 * Estados de la OP (doc "estados, formatos y topes"). No se calculan acá: los deriva la
 * base en app.v_op_estado (sql/009). Acá están los tipos, qué se puede hacer en cada uno
 * y los chequeos de la tarjeta de aprobación.
 */
export const ESTADOS_OP = ["En armado", "A aprobar", "Observada", "Bloqueada", "Autorizada", "Pagada", "Descartada"] as const;
export type EstadoOP = (typeof ESTADOS_OP)[number];
export type Decision = "Aprobada" | "Observada" | "Bloqueada";

/** Se decide (o se cambia la decisión) mientras la OP está mandada y sin pagar. */
export const SE_DECIDE: EstadoOP[] = ["A aprobar", "Observada", "Bloqueada"];
/** Se descarta mientras no esté pagada. */
export const SE_DESCARTA: EstadoOP[] = ["En armado", "A aprobar", "Observada", "Bloqueada", "Autorizada"];

export interface ItemLinea {
  descripcion: string;
  cantidad: string | null;
  precio: string | null;
  /** Precio unitario de la última compra del mismo ítem al mismo proveedor. */
  anterior: string | null;
  anterior_fecha: string | null;
}

export interface LineaAprobacion {
  op_numero: string;
  id: string;
  tipo: string;
  numero: string;
  fecha: string;
  vencimiento: string | null;
  unidad: string;
  unidad_nombre: string;
  importe: string;
  archivo_link: string | null;
  quien: string | null;
  para_que: string | null;
  tiene_remito: boolean;
  decision: Decision | null;
  motivo: string | null;
  usuario: string | null;
  decidido_en: string | null;
  aprobador_id: number | null;
  aprobador: string | null;
  items: ItemLinea[] | null;
}

/**
 * Quién decide un renglón: el aprobador de su unidad (app.aprobadores). Si la unidad no
 * tiene aprobador cargado, cualquier admin, para que nada quede sin dueño.
 */
export function decide(linea: Pick<LineaAprobacion, "aprobador_id">, usuario: { id: number; role: string }): boolean {
  if (linea.aprobador_id == null) return usuario.role === "admin";
  return linea.aprobador_id === usuario.id;
}

/** Suba de precio que se marca en amarillo. Se ajusta viéndolo andar. */
export const MARGEN_PRECIO = 0.05;

export interface Suba {
  descripcion: string;
  factura: string;
  precio: string;
  anterior: string;
  anterior_fecha: string | null;
  /** En porcentaje, con un decimal. */
  pct: string;
}

/** Ítems que cuestan más que la última compra al mismo proveedor, por encima del margen. */
export function subasDePrecio(lineas: Pick<LineaAprobacion, "tipo" | "numero" | "items">[]): Suba[] {
  const subas: Suba[] = [];
  for (const l of lineas) {
    for (const it of l.items ?? []) {
      if (!it.precio || !it.anterior) continue;
      const ant = new Decimal(it.anterior);
      if (ant.lte(0)) continue;
      const pct = new Decimal(it.precio).div(ant).minus(1);
      if (pct.gt(MARGEN_PRECIO)) {
        subas.push({
          descripcion: it.descripcion, factura: `${l.tipo} ${l.numero}`, precio: it.precio,
          anterior: it.anterior, anterior_fecha: it.anterior_fecha, pct: pct.times(100).toFixed(1),
        });
      }
    }
  }
  return subas;
}

export interface Chequeo {
  clave: "remito" | "pdf" | "alta" | "precio";
  ok: boolean;
  texto: string;
}

/**
 * La línea de chequeos de la tarjeta: verde si está bien, amarillo solo lo que hay que
 * mirar. Si todo está en verde, se aprueba de un toque.
 */
export function chequeosOP(
  lineas: Pick<LineaAprobacion, "tipo" | "numero" | "items" | "tiene_remito" | "archivo_link">[],
  faltantesProveedor: string[],
): Chequeo[] {
  const sinRemito = lineas.filter((l) => !l.tiene_remito && !l.tipo.startsWith("Nota de") && l.tipo !== "Remito");
  const sinPdf = lineas.filter((l) => !l.archivo_link && l.tipo !== "Sin factura");
  const subas = subasDePrecio(lineas);
  const sinHistoria = !lineas.some((l) => (l.items ?? []).some((i) => i.precio && i.anterior));
  const nombres = (ls: { tipo: string; numero: string }[]) => ls.map((l) => l.numero).join(", ");
  return [
    { clave: "remito", ok: sinRemito.length === 0,
      texto: sinRemito.length === 0 ? "Cruza con remito" : `Sin remito: ${nombres(sinRemito)}` },
    { clave: "pdf", ok: sinPdf.length === 0,
      texto: sinPdf.length === 0 ? "Tiene PDF" : `Sin PDF: ${nombres(sinPdf)}` },
    { clave: "alta", ok: faltantesProveedor.length === 0,
      texto: faltantesProveedor.length === 0 ? "Alta del proveedor completa" : `Al proveedor le falta: ${faltantesProveedor.join(", ")}` },
    { clave: "precio", ok: subas.length === 0,
      texto: subas.length > 0
        ? `${subas.length} ítem${subas.length > 1 ? "s" : ""} más caro${subas.length > 1 ? "s" : ""} que la última compra`
        : sinHistoria ? "Precio: sin compras anteriores para comparar" : "Precio igual o menor que la última compra" },
  ];
}
