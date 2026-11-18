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
  /** La factura tiene ítems de varias unidades: este renglón es la parte de una. */
  partida: boolean;
  archivo_link: string | null;
  quien: string | null;
  para_que: string | null;
  tiene_remito: boolean;
  /** Suma de los importes de sus remitos firmados (estado ok); null si ninguno tiene importe. */
  remito_importe: string | null;
  factura_total: string;
  factura_neto: string;
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

/**
 * Renglones de otro aprobador que un admin puede resolver: los observados o bloqueados
 * ("Observar ... le llega a Adriano"). Se resuelven con una acción aparte, con
 * comentario, para que aprobar lo propio nunca pise la observación de otro.
 */
export function aResolver(
  linea: Pick<LineaAprobacion, "aprobador_id" | "decision">, usuario: { id: number; role: string },
): boolean {
  return usuario.role === "admin" && !decide(linea, usuario)
    && (linea.decision === "Observada" || linea.decision === "Bloqueada");
}

/**
 * Quién puede quitar una observación o un bloqueo (el renglón vuelve a "sin decidir",
 * sin pasar por aprobado; sql/013): quien decide ese renglón o un admin.
 */
export function quita(
  linea: Pick<LineaAprobacion, "aprobador_id" | "decision">, usuario: { id: number; role: string },
): boolean {
  return (linea.decision === "Observada" || linea.decision === "Bloqueada")
    && (usuario.role === "admin" || decide(linea, usuario));
}

/** Días enteros entre dos fechas YYYY-MM-DD (o timestamps: se toma la fecha). */
export function diasEntre(desde: string, hasta: string): number {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(hasta) - d(desde)) / 86_400_000);
}

export interface PendienteOP {
  tipo: string;
  proveedor: string;
  detalle: string;
  href: string;
}

type OPPendiente = {
  numero: string; estado: EstadoOP; razon_social: string; armada_en?: string | null; enviada_en: string | null;
  lineas: Pick<LineaAprobacion, "decision" | "aprobador" | "usuario" | "motivo" | "importe" | "vencimiento">[];
};

const hace = (n: number, hoy = "desde hoy") => (n <= 0 ? hoy : n === 1 ? "hace 1 día" : `hace ${n} días`);

/**
 * Lo que hay que hacer con las OP de la app, para el Inicio: en armado, esperando a
 * alguien ("esperando a X hace N días": sin recordatorios automáticos, Adriano decide si
 * insiste), observadas o bloqueadas, y autorizadas para pagar.
 */
export function pendientesOP(ops: OPPendiente[], hoy: string): PendienteOP[] {
  const out: PendienteOP[] = [];
  for (const o of ops) {
    const base = { proveedor: o.razon_social };
    if (o.estado === "En armado") {
      const n = o.armada_en ? diasEntre(o.armada_en, hoy) : 0;
      out.push({ ...base, tipo: "OP en armado", detalle: `${o.numero} armada ${hace(n, "hoy")}: mandala a aprobar o descartala`, href: "/op" });
    } else if (o.estado === "A aprobar") {
      const n = o.enviada_en ? diasEntre(o.enviada_en, hoy) : 0;
      const quienes = [...new Set(o.lineas.filter((l) => !l.decision).map((l) => l.aprobador ?? "un admin"))];
      out.push({ ...base, tipo: "OP esperando aprobación", detalle: `${o.numero} esperando a ${quienes.join(" y ")} ${hace(n)}`, href: "/aprobar" });
    } else if (o.estado === "Observada" || o.estado === "Bloqueada") {
      const l = o.lineas.find((x) => x.decision === (o.estado === "Observada" ? "Observada" : "Bloqueada"));
      out.push({ ...base, tipo: `OP ${o.estado.toLowerCase()}`, detalle: `${o.numero}: ${l?.usuario ?? ""}${l?.motivo ? ` — ${l.motivo}` : ""}`, href: "/aprobar" });
    } else if (o.estado === "Autorizada") {
      const vence = o.lineas.map((l) => l.vencimiento).filter((v): v is string => !!v).sort()[0];
      out.push({ ...base, tipo: "OP autorizada para pagar", detalle: `${o.numero}${vence ? ` vence ${vence.split("-").reverse().join("/")}` : ""}`, href: "/pagos" });
    }
  }
  return out;
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

/**
 * Cruce factura ↔ remito con tolerancia cero (solo centavos, menos de $1; Adriano 17/11).
 * El importe del remito a veces es el total y a veces el neto de la factura: cruza con
 * cualquiera de los dos. Sin importe en los remitos no hay con qué comparar: no se marca.
 * Devuelve el texto del problema, o null si cruza o no hay datos.
 */
export function diferenciaRemito(
  l: Pick<LineaAprobacion, "remito_importe" | "factura_total" | "factura_neto">,
): string | null {
  if (l.remito_importe == null) return null;
  const rem = new Decimal(l.remito_importe);
  const cierra = (v: string) => rem.minus(v).abs().lt(1);
  if (cierra(l.factura_total) || cierra(l.factura_neto)) return null;
  const $ = (v: Decimal.Value) => `$${new Decimal(v).toDecimalPlaces(2).toNumber().toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
  return `remito ${$(rem)} contra factura ${$(l.factura_total)}`;
}

/** Facturas que no llevan remito aparte (notas de crédito o débito, y el tipo Remito). */
const sinRemitoAparte = (tipo: string) => tipo.startsWith("Nota de") || tipo === "Remito";

/**
 * Por qué un renglón no cruza (vacío si cruza): lo que impide aprobarlo solo por tope.
 * Es lo mismo que la línea de chequeos, pero de un renglón.
 */
export function noCruzaRenglon(
  l: Pick<LineaAprobacion, "tipo" | "numero" | "items" | "tiene_remito" | "archivo_link" | "remito_importe" | "factura_total" | "factura_neto">,
): string[] {
  const no: string[] = [];
  if (!l.tiene_remito && !sinRemitoAparte(l.tipo)) no.push("sin remito");
  const dif = diferenciaRemito(l);
  if (dif) no.push(`no coincide con el remito (${dif})`);
  if (!l.archivo_link && l.tipo !== "Sin factura") no.push("sin PDF");
  if (subasDePrecio([l]).length > 0) no.push("más caro que la última compra");
  return no;
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
  lineas: Pick<LineaAprobacion, "tipo" | "numero" | "items" | "tiene_remito" | "archivo_link" | "remito_importe" | "factura_total" | "factura_neto">[],
  faltantesProveedor: string[],
): Chequeo[] {
  const sinRemito = lineas.filter((l) => !l.tiene_remito && !sinRemitoAparte(l.tipo));
  const noCoinciden = lineas.filter((l) => diferenciaRemito(l) != null);
  const sinPdf = lineas.filter((l) => !l.archivo_link && l.tipo !== "Sin factura");
  const subas = subasDePrecio(lineas);
  const sinHistoria = !lineas.some((l) => (l.items ?? []).some((i) => i.precio && i.anterior));
  const nombres = (ls: { tipo: string; numero: string }[]) => [...new Set(ls.map((l) => l.numero))].join(", ");
  return [
    { clave: "remito", ok: sinRemito.length === 0 && noCoinciden.length === 0,
      texto: sinRemito.length > 0 ? `Sin remito: ${nombres(sinRemito)}`
        : noCoinciden.length > 0 ? `No coincide con el remito: ${[...new Set(noCoinciden.map((l) => `${l.numero} (${diferenciaRemito(l)})`))].join(", ")}`
        : "Cruza con remito" },
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
