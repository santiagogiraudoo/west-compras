import Link from "next/link";
import { ChevronRight, CheckCircle, ExternalLink, ListChecks, Paperclip, TriangleAlert } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { FichaCard, FichaLabel, FichaTabla, FichaTablaCabecera, FichaTablaFila } from "@/components/properties/FichaCard";
import { formatDate } from "@/lib/utils";
import {
  aResolver, chequeosOP, decide, diferenciaRemito, quita, SE_DECIDE, subasDePrecio, type LineaAprobacion,
} from "@/lib/op/estados";
import { vencimientoOP } from "@/lib/op/pago";
import type { CompraAnterior, OPConLineas } from "@/lib/op/queries";
import { EstadoOPBadge } from "./EstadoOP";
import { AccionOP } from "./AccionOP";
import { limpiarItem, queCorto } from "./formato";

const $ = (v: string | null, className?: string) => <MoneyCell value={Number(v ?? 0)} currency="ARS" decimals={2} className={className} />;
const COLS_ITEMS = "minmax(0,1fr) 80px 120px 150px";

interface Props {
  op: OPConLineas;
  usuario: { id: number; role: string };
  deuda: string | null;
  ultimas: CompraAnterior[];
  /** En la ficha de la OP el número no lleva link (ya se está ahí). */
  enFicha?: boolean;
}

/**
 * Tarjeta de aprobación (doc "Lo que ve quien aprueba"): arriba la OP en una línea y el
 * avance, los chequeos en verde o ámbar, un renglón por factura con lo que muestra la
 * tarea de Pagos en ClickUp (qué, para qué, quién, unidad) y los botones. Lo demás, en
 * "Ver más". Quien aprueba ve sus renglones arriba y los de los demás atenuados.
 */
export function TarjetaOP({ op, usuario, deuda, ultimas, enFicha }: Props) {
  const mias = usuario.role === "consulta" ? [] : op.lineas.filter((l) => decide(l, usuario));
  const resolvibles = op.lineas.filter((l) => aResolver(l, usuario));
  const otras = op.lineas.filter((l) => !mias.includes(l) && !resolvibles.includes(l));
  const chequeos = chequeosOP(op.lineas, op.faltan);
  const subas = subasDePrecio(op.lineas);
  const unidades = [...new Set(op.lineas.map((l) => l.unidad_nombre || l.unidad))].join(", ");
  const vence = vencimientoOP(op.lineas);
  const hoy = new Date().toISOString().slice(0, 10);
  const enDecision = SE_DECIDE.includes(op.estado);
  const puede = mias.length > 0 && enDecision;
  const resuelve = resolvibles.length > 0 && enDecision;
  const quitaAlgo = enDecision && usuario.role !== "consulta" && op.lineas.some((l) => quita(l, usuario));
  const pendientes = mias.filter((l) => l.decision !== "Aprobada").length;
  const aprobadas = op.lineas.filter((l) => l.decision === "Aprobada").length;
  // Con renglones propios observados o bloqueados no se salta a otro estado: primero se
  // quita la observación (vuelven a "sin decidir") y después se decide de nuevo.
  const misFrenados = mias.some((l) => l.decision === "Observada" || l.decision === "Bloqueada");
  const decideAhora = puede && !misFrenados;

  return (
    <FichaCard
      icon={ListChecks}
      title={enFicha ? "Facturas de la OP" : (
        <Link href={`/op/${op.numero}`} className="underline-offset-2 hover:underline">{op.numero}</Link>
      )}
      actions={<span className="text-xs text-white/75">{op.lineas.length} {op.lineas.length === 1 ? "renglón" : "renglones"}</span>}
    >
      {/* La OP en una línea */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-[#f2f1ec] px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/cuenta/${op.proveedor_codigo}`} className="text-[15px] font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline">
              {op.razon_social}
            </Link>
            <EstadoOPBadge estado={op.estado} />
          </div>
          <p className="mt-0.5 text-[12.5px] text-[#737373]">
            {unidades}
            {op.titular ? <> · factura a {op.titular}</> : null}
            {vence ? <> · <span className={vence < hoy ? "font-medium text-[#b91c1c]" : ""}>{vence < hoy ? "venció" : "vence"} {formatDate(vence)}</span></> : null}
          </p>
        </div>
        <div className="text-right">
          <FichaLabel>Total</FichaLabel>
          {$(op.total_imputado, "block text-[20px] leading-7 font-semibold text-primary")}
        </div>
      </header>

      {/* Avance y chequeos */}
      <div className="space-y-2.5 border-b border-[#f2f1ec] px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] font-medium tabular-nums">{aprobadas}/{op.lineas.length} aprobados</span>
          <div className="flex flex-1 gap-1" aria-hidden>
            {op.lineas.map((l) => (
              <span key={`${l.id}-${l.unidad}`} className={`h-1.5 flex-1 rounded-full ${
                l.decision === "Aprobada" ? "bg-[#1B4332]" : l.decision === "Bloqueada" ? "bg-[#dc2626]"
                  : l.decision === "Observada" ? "bg-[#ea580c]" : "bg-[#e8e8e3]"
              }`} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chequeos.map((c) => <Chequeo key={c.clave} ok={c.ok}>{c.texto}</Chequeo>)}
        </div>
      </div>

      {/* Un renglón por factura (y unidad) */}
      {[...mias, ...resolvibles, ...otras].map((l) => (
        <Renglon key={`${l.id}-${l.unidad}`} l={l} mio={!otras.includes(l)} rubro={op.rubro} hoy={hoy} />
      ))}

      {/* Ver más y botones */}
      <footer className="flex flex-wrap items-start justify-between gap-3 border-t border-[#eeede8] bg-[#fafaf7] px-5 py-3">
        <details className="group min-w-0 flex-1 basis-full">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-[6px] px-1.5 py-0.5 -ml-1.5 text-[12.5px] font-medium text-[#8a8a85] hover:bg-[#f0efe9] hover:text-primary">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            <span className="group-open:hidden">Ver más: artículos, precios y cuenta del proveedor</span>
            <span className="hidden group-open:inline">Ver menos</span>
          </summary>
          <VerMas op={op} subas={subas} deuda={deuda} ultimas={ultimas} />
        </details>
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {puede || resuelve || quitaAlgo ? (
            <>
              {quitaAlgo && <AccionOP numero={op.numero} accion="quitar" />}
              {decideAhora && <AccionOP numero={op.numero} accion="bloquear" />}
              {decideAhora && <AccionOP numero={op.numero} accion="observar" />}
              {resuelve && <AccionOP numero={op.numero} accion="resolver" />}
              {decideAhora && pendientes > 0 && <AccionOP numero={op.numero} accion="aprobar" />}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {enDecision && mias.length === 0 ? "Ningún renglón es de una unidad tuya" : ""}
            </span>
          )}
        </div>
      </footer>
    </FichaCard>
  );
}

function Renglon({ l, mio, rubro, hoy }: { l: LineaAprobacion; mio: boolean; rubro: string | null; hoy: string }) {
  const que = queCorto(l.items, rubro);
  const dif = diferenciaRemito(l);
  const subas = subasDePrecio([l]);
  const vencida = !!l.vencimiento && l.vencimiento < hoy;
  const frenado = l.decision === "Observada" || l.decision === "Bloqueada";
  return (
    <div className={`border-b border-[#f2f1ec] px-5 py-3.5 ${mio ? "" : "opacity-60"} ${frenado ? "bg-[#fffaf8]" : ""}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(150px,auto)] items-start gap-x-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link href={`/bandeja/${l.id}`} className="text-[13.5px] font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline">
              {l.tipo} {l.numero}
            </Link>
            <span className="text-[12px] text-[#8a8a85]">
              {formatDate(l.fecha)} → <span className={vencida ? "font-medium text-[#b91c1c]" : ""}>{l.vencimiento ? formatDate(l.vencimiento) : "—"}</span>
            </span>
          </div>
          <div className="mt-1.5 grid gap-y-1">
            {que && <Campo rotulo="Qué">{que}</Campo>}
            {l.para_que && <Campo rotulo="Para qué" fuerte>{l.para_que}</Campo>}
            <Campo rotulo="Quién">{l.quien ?? <span className="text-[#c4c3bd]">—</span>}</Campo>
            <Campo rotulo="Unidad">
              {l.unidad_nombre || l.unidad}{l.partida ? <span className="text-[#a3a3a3]"> (parte)</span> : null}
            </Campo>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {l.tiene_remito ? (
              dif ? <Chequeo ok={false}>No coincide con el remito ({dif})</Chequeo> : <Chequeo ok>Con remito</Chequeo>
            ) : (
              !l.tipo.startsWith("Nota de") && l.tipo !== "Remito" && <Chequeo ok={false}>Sin remito</Chequeo>
            )}
            {subas.length > 0 && <Chequeo ok={false}>{subas.length === 1 ? "1 artículo más caro" : `${subas.length} artículos más caros`}</Chequeo>}
            {l.archivo_link ? (
              <a href={l.archivo_link} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-[4px] border border-[#e8e8e3] bg-white px-2 py-[2px] text-[11.5px] font-medium text-primary hover:bg-[#f0f6f2]">
                <Paperclip className="h-3 w-3" /> PDF <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            ) : (
              l.tipo !== "Sin factura" && <Chequeo ok={false}>Sin PDF</Chequeo>
            )}
          </div>
        </div>

        {$(l.importe, "pt-px text-[15px] font-semibold")}

        <div className="flex flex-col items-end gap-0.5 text-right text-[12px]">
          {l.decision === "Aprobada" ? (
            <span className="inline-flex items-center gap-1 font-medium text-[#0f2a1f]"><CheckCircle className="h-3.5 w-3.5" /> Aprobado</span>
          ) : l.decision ? (
            <span className={`inline-flex items-center gap-1 font-medium ${l.decision === "Bloqueada" ? "text-[#b91c1c]" : "text-[#9a3412]"}`}>
              <TriangleAlert className="h-3.5 w-3.5" /> {l.decision}
            </span>
          ) : (
            <span className="text-[#8a8a85]">Esperando a {l.aprobador ?? "un admin"}</span>
          )}
          {l.decision && l.usuario && <span className="text-[11.5px] text-[#8a8a85]">por {l.usuario}{l.decidido_en ? ` · ${formatDate(l.decidido_en)}` : ""}</span>}
        </div>
      </div>
      {frenado && l.motivo && (
        <p className={`mt-2.5 rounded-[6px] border-l-[3px] px-3 py-2 text-[13px] ${
          l.decision === "Bloqueada" ? "border-l-[#dc2626] bg-[#fef2f2] text-[#991b1b]" : "border-l-[#ea580c] bg-[#fff7ed] text-[#9a3412]"
        }`}>
          <span className="font-semibold">{l.decision === "Bloqueada" ? "Bloqueo" : "Observación"}:</span> {l.motivo}
        </p>
      )}
      {l.decision === "Aprobada" && l.motivo && (
        <p className="mt-1.5 text-[12px] text-[#737373]">Comentario: {l.motivo}</p>
      )}
    </div>
  );
}

function VerMas({ op, subas, deuda, ultimas }: {
  op: OPConLineas; subas: ReturnType<typeof subasDePrecio>; deuda: string | null; ultimas: CompraAnterior[];
}) {
  const conItems = op.lineas.filter((l) => l.items?.length);
  return (
    <div className="mt-3 grid gap-4 rounded-[10px] border border-[#eeede8] bg-white p-4 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="min-w-0 space-y-2">
        <FichaLabel>Artículos</FichaLabel>
        {conItems.length === 0 ? <p className="text-[13px] text-[#8a8a85]">Sin artículos cargados.</p> : (
          <FichaTabla>
            <FichaTablaCabecera cols={COLS_ITEMS}>
              <span>Descripción</span><span className="text-right">Cant.</span><span className="text-right">Precio</span><span className="text-right">Última compra</span>
            </FichaTablaCabecera>
            {conItems.flatMap((l) => (l.items ?? []).map((it, i) => {
              const suba = subas.find((s) => s.descripcion === it.descripcion && s.factura === `${l.tipo} ${l.numero}`);
              return (
                <FichaTablaFila key={`${l.id}-${l.unidad}-${i}`} cols={COLS_ITEMS}>
                  <span className="min-w-0 pr-3">{limpiarItem(it.descripcion)}</span>
                  <span className="text-right text-[#525252]">{it.cantidad ? Number(it.cantidad).toLocaleString("es-AR") : "—"}</span>
                  <span className={`text-right ${suba ? "font-medium text-[#92400e]" : ""}`}>{it.precio ? $(it.precio) : "—"}</span>
                  <span className="text-right text-[12px] text-[#8a8a85]">
                    {it.anterior ? <>{$(it.anterior)}{suba ? <span className="text-[#92400e]"> · +{suba.pct.replace(".", ",")} %</span> : null}</> : "—"}
                  </span>
                </FichaTablaFila>
              );
            }))}
          </FichaTabla>
        )}
      </section>
      <section className="min-w-0 space-y-3 text-[13px]">
        <div>
          <FichaLabel>Cuenta corriente</FichaLabel>
          <p className="mt-1">Se le debe {$(deuda, "font-medium")} · <Link href={`/cuenta/${op.proveedor_codigo}`} className="font-medium text-primary underline-offset-2 hover:underline">ver extracto</Link></p>
        </div>
        <div>
          <FichaLabel>Últimas compras al proveedor</FichaLabel>
          <ul className="mt-1 space-y-0.5 text-[12.5px]">
            {ultimas.map((c) => (
              <li key={c.numero} className="flex justify-between gap-2"><span className="text-[#525252]">{formatDate(c.fecha)} · {c.tipo} {c.numero}</span>{$(c.total)}</li>
            ))}
          </ul>
        </div>
        <p className="text-[12px] text-[#8a8a85]">
          Armada por {op.armada_por}{op.enviada_en ? ` · mandada a aprobar por ${op.enviada_por} el ${formatDate(op.enviada_en)}` : ""}
        </p>
      </section>
    </div>
  );
}

/** Un dato del renglón: rótulo dorado chico y el valor al lado. */
function Campo({ rotulo, fuerte, children }: { rotulo: string; fuerte?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-x-2 text-[13px]">
      <span className="pt-[2px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">{rotulo}</span>
      <span className={`min-w-0 line-clamp-2 ${fuerte ? "text-foreground" : "text-[#525252]"}`}>{children}</span>
    </div>
  );
}

/** Un chequeo: verde si está, ámbar si hay que mirarlo. */
function Chequeo({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-[2px] text-[11.5px] font-medium ${
      ok ? "bg-[#f0f6f2] text-[#0f2a1f]" : "bg-[#fffbeb] text-[#92400e]"
    }`}>
      {ok ? <CheckCircle className="h-3 w-3" strokeWidth={2.2} /> : <TriangleAlert className="h-3 w-3" strokeWidth={2.2} />} {children}
    </span>
  );
}
