import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ban, CheckCircle, ChevronRight, Clock, ExternalLink, Landmark, ListChecks, Paperclip, TriangleAlert, type LucideIcon,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { hoyArgentina, listarOPAbiertas } from "@/lib/cuenta/queries";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import { estadoAprobacion, vencimientoOP, type EstadoAprobacion } from "@/lib/op/pago";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { NotaFactura } from "@/components/shared/NotaFactura";
import { StatusPill, type PillTone } from "@/components/shared/StatusPill";
import {
  FichaCard, FichaLabel, FichaTabla, FichaTablaCabecera, FichaTablaFila,
} from "@/components/properties/FichaCard";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { AnularOP } from "../AnularOP";
import { DecidirLinea } from "../DecidirLinea";
import { AprobarTodas } from "../AprobarTodas";

export const dynamic = "force-dynamic";

const ESTADO: Record<EstadoAprobacion, { tone: PillTone; icon: LucideIcon }> = {
  "A aprobar": { tone: "amber", icon: Clock },
  Observada: { tone: "red", icon: Ban },
  Autorizada: { tone: "success", icon: CheckCircle },
};

const COLS_RENGLONES = "minmax(0,1fr) 90px 120px";

/**
 * Ficha de una OP abierta: la tarjeta de aprobación. Una línea por factura con lo que
 * muestra la tarea de Pagos en ClickUp para decidir (para qué, qué, quién, unidad,
 * remito) y su decisión. Lee lo mismo que la acción de aprobar (listarOPAbiertas).
 */
export default async function FichaOPPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const [ops, session] = await Promise.all([listarOPAbiertas(), auth()]);
  const op = ops.find((o) => o.numero === decodeURIComponent(numero));
  if (!op) notFound();

  // Todo leído, nada se escribe.
  const ids = op.facturas.map((f) => BigInt(f.id));
  const [prov, comprobantes, remitos, unidades, [cabecera]] = await Promise.all([
    prisma.proveedor.findUnique({ where: { codigo: op.proveedor_codigo } }),
    prisma.comprobante.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, fecha: true, archivo_link: true, descripcion: true, retiro_por: true,
        aprobado_por: true, aprobacion_detalle: true,
        items: {
          select: { descripcion: true, para_que: true, cantidad: true, unidad_medida: true, subtotal: true },
          orderBy: { orden: "asc" },
        },
      },
    }),
    prisma.remito.findMany({
      where: { comprobante_id: { in: ids } },
      select: { comprobante_id: true, numero: true, fecha: true, retiro_por: true, autorizo: true, archivo_link: true },
      orderBy: { fecha: "asc" },
    }),
    prisma.unidad.findMany({ where: { codigo: { in: op.facturas.map((f) => f.unidad) } }, select: { codigo: true, nombre: true } }),
    prisma.$queryRaw<{ clickup_op_id: string | null; medio_pago: string | null }[]>`
      select clickup_op_id, medio_pago from cc.ordenes_pago where numero = ${op.numero}`,
  ]);
  const extra = new Map(comprobantes.map((c) => [String(c.id), c]));
  const remitosDe = (id: string) => remitos.filter((r) => String(r.comprobante_id) === id);
  const nombreUnidad = new Map(unidades.map((u) => [u.codigo, u.nombre]));
  const nombresUnidades = [...new Set(op.facturas.map((f) => nombreUnidad.get(f.unidad) ?? f.unidad))];
  const medio = cabecera?.medio_pago ?? op.medio_pago_habitual;
  const vence = vencimientoOP(op.facturas);

  const hoy = hoyArgentina();
  const app = op.origen === "app";
  const aprueba = app && session?.user?.role === "admin";
  const estado = estadoAprobacion(op.facturas);
  const vivas = op.facturas.filter((f) => Number(f.importe) !== 0);
  const aprobadas = vivas.filter((f) => f.decision === "Aprobada").length;
  const observadas = vivas.filter((f) => f.decision === "Observada").length;
  const pendientes = vivas.filter((f) => !f.decision);
  const faltan = prov ? faltantesProveedor(prov) : [];
  const cuenta = [
    op.cbu && { k: "CBU", v: op.cbu, mono: true },
    op.alias && { k: "Alias", v: op.alias, mono: true },
    op.banco && { k: "Banco", v: op.banco },
    op.cuenta_titular && { k: "Titular", v: op.cuenta_titular },
    prov?.cuit && { k: "CUIT", v: prov.cuit, mono: true },
  ].filter((x): x is { k: string; v: string; mono?: boolean } => !!x);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-8 pt-5 pb-8">
      <TituloDePestana label={op.numero} />

      {/* Encabezado: número y estado, a quién y cuánto; la cuenta, chica, abajo */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl leading-[30px] font-semibold tracking-[-0.015em] text-primary">{op.numero}</h1>
            {app ? (
              <StatusPill tone={ESTADO[estado].tone} icon={ESTADO[estado].icon} size="md">{estado}</StatusPill>
            ) : (
              <StatusPill tone="neutral" size="md">{op.estado_clickup ?? op.estado} · ClickUp</StatusPill>
            )}
          </div>
          <p className="mt-1 text-[13.5px] text-[#525252]">
            <Link href={`/cuenta/${op.proveedor_codigo}`} className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline">
              {op.razon_social}
            </Link>
            {op.titular ? <> · factura a {op.titular}</> : null}
            {medio ? <> · {medio}</> : null}
            {vence ? <> · <span className={vence < hoy ? "font-medium text-[#b91c1c]" : ""}>{vence < hoy ? "venció" : "vence"} {formatDate(vence)}</span></> : null}
          </p>
          <p className="mt-0.5 text-[12.5px] text-[#8a8a85]">
            {nombresUnidades.length === 1 ? "Unidad" : "Unidades"}: {nombresUnidades.join(", ")} · armada el {formatDate(op.fecha_op)}
            {!app && cabecera?.clickup_op_id ? (
              <> · <a href={`https://app.clickup.com/t/${cabecera.clickup_op_id}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline">
                ver en ClickUp <ExternalLink className="h-3 w-3" />
              </a></>
            ) : null}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#8a8a85]">
            <Landmark className="h-3.5 w-3.5" />
            {cuenta.length === 0 && <span>Sin cuenta cargada</span>}
            {cuenta.map((d) => (
              <span key={d.k}>
                {d.k} <span className={`text-[#404040] ${d.mono ? "tabular-nums" : ""}`}>{d.v}</span>
              </span>
            ))}
            {faltan.length > 0 && (
              <Link href={`/proveedores/${op.proveedor_codigo}`}
                className="inline-flex items-center gap-1 rounded-[4px] bg-[#fffbeb] px-1.5 py-px font-medium text-[#92400e] hover:underline">
                <TriangleAlert className="h-3 w-3" /> Falta {faltan.join(", ")}: completar el alta
              </Link>
            )}
          </p>
        </div>
        <div className="flex items-start gap-4">
          <div className="text-right">
            <FichaLabel>Total a pagar</FichaLabel>
            <MoneyCell value={Number(op.total_imputado)} currency="ARS" decimals={2}
              className="block text-[26px] leading-8 font-semibold text-primary" />
          </div>
          {app && <AnularOP numero={op.numero} />}
        </div>
      </div>

      {/* Avance de la aprobación */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[12px] border border-border bg-white px-5 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
        <span className="text-[13.5px] font-medium">
          {aprobadas} de {vivas.length} {vivas.length === 1 ? "factura aprobada" : "facturas aprobadas"}
        </span>
        <div className="flex min-w-[160px] flex-1 gap-1" aria-hidden>
          {vivas.map((f) => (
            <span key={f.id} className={`h-1.5 flex-1 rounded-full ${
              f.decision === "Aprobada" ? "bg-[#1B4332]" : f.decision === "Observada" ? "bg-[#dc2626]" : "bg-[#e8e8e3]"
            }`} />
          ))}
        </div>
        <span className="text-[13px]">
          {!app ? (
            <span className="text-muted-foreground">Viene de ClickUp: se aprueba allá.</span>
          ) : observadas > 0 ? (
            <span className="font-medium text-[#991b1b]">Frenada: {observadas === 1 ? "hay una factura observada" : `hay ${observadas} facturas observadas`}.</span>
          ) : estado === "Autorizada" ? (
            <Link href="/pagos" className="font-medium text-primary underline-offset-2 hover:underline">Autorizada: ya está en Pagos</Link>
          ) : (
            <span className="text-muted-foreground">Falta decidir {pendientes.length === 1 ? "una" : pendientes.length}.</span>
          )}
        </span>
      </div>

      {/* Las facturas, una por línea, a todo el ancho */}
      <FichaCard
        icon={ListChecks}
        title="Facturas de la OP"
        actions={aprueba && pendientes.length > 1 ? (
          <AprobarTodas numero={op.numero} total={op.total_imputado}
            lineas={pendientes.map((f) => ({ id: f.id, factura: `${f.tipo} ${f.numero}`, importe: f.importe }))} />
        ) : (
          <span className="text-xs text-white/75">{vivas.length} {vivas.length === 1 ? "factura" : "facturas"}</span>
        )}
      >
        {op.facturas.map((f) => {
          const c = extra.get(f.id);
          const rem = remitosDe(f.id);
          const vencida = !!f.vencimiento && f.vencimiento < hoy;
          const cero = Number(f.importe) === 0;
          const para = paraQue(c?.items ?? []);
          const quienLo = quien(rem, c?.retiro_por);
          return (
            <div key={f.id} className={`border-b border-[#f2f1ec] px-5 py-4 last:border-b-0 ${cero ? "opacity-50" : ""} ${
              f.decision === "Observada" ? "bg-[#fffafa]" : ""
            }`}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(160px,auto)] items-start gap-x-6">
                <div className="min-w-0">
                  {/* Factura y fechas */}
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link href={`/bandeja/${f.id}`} className="text-[14px] font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline">
                      {f.tipo} {f.numero}
                    </Link>
                    <span className="text-[12.5px] text-[#8a8a85]">
                      {c ? formatDate(c.fecha) : ""} → <span className={vencida ? "font-medium text-[#b91c1c]" : ""}>
                        {vencida ? "venció" : "vence"} {formatDate(f.vencimiento)}
                      </span>
                    </span>
                  </div>

                  {/* Qué, para qué, quién, dónde: lo que se mira para decidir */}
                  <div className="mt-2 grid gap-x-8 gap-y-1.5 2xl:grid-cols-2">
                    <Campo rotulo="Qué">
                      {c && c.items.length > 0 ? resumenItems(c.items.map((i) => i.descripcion)) : <Vacio />}
                    </Campo>
                    <Campo rotulo="Quién">{quienLo ?? <Vacio />}</Campo>
                    {para && <Campo rotulo="Para qué" fuerte>{para}</Campo>}
                    <Campo rotulo="Unidad">
                      {nombreUnidad.get(f.unidad) ?? f.unidad} <span className="text-[#a3a3a3]">{f.unidad}</span>
                    </Campo>
                  </div>

                  {/* Chequeos */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {rem.length > 0 ? (
                      <Chequeo ok icon={CheckCircle}>
                        {rem.length === 1 ? <>Remito {rem[0].numero ?? "S/N"} · {formatDate(rem[0].fecha)}</> : <>{rem.length} remitos</>}
                      </Chequeo>
                    ) : (
                      <Chequeo icon={TriangleAlert} title={c?.aprobacion_detalle ?? undefined}>Sin remito</Chequeo>
                    )}
                    <Chequeo ok icon={CheckCircle}>Factura aprobada{c?.aprobado_por ? ` por ${c.aprobado_por}` : ""}</Chequeo>
                    {!para && <Chequeo icon={TriangleAlert}>Falta para qué</Chequeo>}
                    {c?.archivo_link ? (
                      <a href={c.archivo_link} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-[4px] border border-[#e8e8e3] bg-white px-2 py-[2px] text-[11.5px] font-medium text-primary hover:bg-[#f0f6f2]">
                        <Paperclip className="h-3 w-3" /> PDF de la factura <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    ) : (
                      <Chequeo icon={TriangleAlert}>Sin PDF</Chequeo>
                    )}
                  </div>
                </div>

                <MoneyCell value={Number(f.importe)} currency="ARS" decimals={2} className="pt-px text-[16px] font-semibold" />

                <div className="flex flex-col items-end gap-1.5">
                  {f.decision === "Aprobada" && <StatusPill tone="success" icon={CheckCircle}>Aprobada</StatusPill>}
                  {f.decision === "Observada" && <StatusPill tone="red" icon={Ban}>Observada</StatusPill>}
                  {f.decision && f.usuario && <span className="text-[11.5px] text-[#8a8a85]">por {f.usuario}</span>}
                  {aprueba && !cero && (
                    <DecidirLinea numero={op.numero} comprobanteId={f.id} factura={`${f.tipo} ${f.numero}`} decision={f.decision} />
                  )}
                </div>
              </div>

              {f.decision === "Observada" && f.motivo && (
                <p className="mt-3 rounded-[6px] border-l-[3px] border-l-[#dc2626] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#991b1b]">
                  <span className="font-semibold">Observación:</span> {f.motivo}
                </p>
              )}

              {/* El detalle, a pedido: renglones, remitos y la nota de la factura, ordenados */}
              {c && (c.items.length > 0 || rem.length > 0 || c.descripcion) && (
                <details className="group mt-3">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-[6px] px-1.5 py-0.5 -ml-1.5 text-[12.5px] font-medium text-[#8a8a85] hover:bg-[#f5f5f0] hover:text-primary">
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                    <span className="group-open:hidden">Ver renglones, remitos y nota</span>
                    <span className="hidden group-open:inline">Ocultar detalle</span>
                  </summary>
                  <div className="mt-2 grid gap-4 rounded-[10px] border border-[#eeede8] bg-white p-4 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    {c.items.length > 0 && (
                      <section className="min-w-0 space-y-2">
                        <FichaLabel>Renglones</FichaLabel>
                        <FichaTabla>
                          <FichaTablaCabecera cols={COLS_RENGLONES}>
                            <span>Descripción</span><span className="text-right">Cantidad</span><span className="text-right">Subtotal</span>
                          </FichaTablaCabecera>
                          {c.items.map((i, k) => (
                            <FichaTablaFila key={k} cols={COLS_RENGLONES}>
                              <span className="min-w-0 pr-3">
                                {limpiarItem(i.descripcion)}
                                {i.para_que && <span className="block text-[11.5px] text-[#8a8a85]">{i.para_que}</span>}
                              </span>
                              <span className="text-right text-[#525252]">
                                {i.cantidad != null ? `${Number(i.cantidad).toLocaleString("es-AR")} ${i.unidad_medida ?? ""}` : "—"}
                              </span>
                              <span className="text-right">
                                {i.subtotal != null ? <MoneyCell value={Number(i.subtotal)} currency="ARS" decimals={2} /> : "—"}
                              </span>
                            </FichaTablaFila>
                          ))}
                        </FichaTabla>
                      </section>
                    )}
                    <div className="min-w-0 space-y-4">
                      {rem.length > 0 && (
                        <section className="space-y-2">
                          <FichaLabel>{rem.length === 1 ? "Remito" : `Remitos (${rem.length})`}</FichaLabel>
                          <ul className="space-y-1.5">
                            {rem.map((r, k) => (
                              <li key={k} className="rounded-[8px] border border-[#eeede8] px-3 py-2 text-[12.5px]">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-foreground">{r.numero ?? "S/N"}</span>
                                  <span className="text-[#8a8a85]">{formatDate(r.fecha)}</span>
                                </div>
                                <div className="mt-0.5 text-[#525252]">
                                  {[r.retiro_por && `Retiró ${r.retiro_por}`, r.autorizo && `autorizó ${r.autorizo}`].filter(Boolean).join(" · ") || "—"}
                                </div>
                                {r.archivo_link?.startsWith("http") ? (
                                  <a href={r.archivo_link} target="_blank" rel="noreferrer"
                                    className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                                    <Paperclip className="h-3 w-3" /> Ver remito
                                  </a>
                                ) : r.archivo_link ? (
                                  <div className="mt-0.5 text-[11.5px] text-[#8a8a85]">{r.archivo_link}</div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {c.descripcion && (
                        <section className="space-y-2">
                          <FichaLabel>Nota de la factura</FichaLabel>
                          <NotaFactura texto={c.descripcion} sinRenglones={c.items[0]?.descripcion} />
                        </section>
                      )}
                    </div>
                  </div>
                </details>
              )}
            </div>
          );
        })}
        {Number(op.otras) !== 0 && (
          <div className="flex items-center justify-between border-t border-[#f2f1ec] px-5 py-3 text-[13px] text-muted-foreground">
            <span>Otras unidades o a cuenta (no se aprueban acá)</span>
            <MoneyCell value={Number(op.otras)} currency="ARS" decimals={2} />
          </div>
        )}
        <div className="flex items-center justify-between border-t border-[#eeede8] bg-[#fafaf7] px-5 py-3">
          <FichaLabel>Total</FichaLabel>
          <MoneyCell value={Number(op.total_imputado)} currency="ARS" decimals={2} className="text-[16px] font-semibold text-primary" />
        </div>
      </FichaCard>
    </div>
  );
}

/** Un dato de la línea: rótulo dorado chico y el valor al lado. */
function Campo({ rotulo, fuerte, children }: { rotulo: string; fuerte?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-x-2 text-[13px]">
      <span className="pt-[2px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">{rotulo}</span>
      <span className={`min-w-0 line-clamp-2 ${fuerte ? "text-foreground" : "text-[#525252]"}`}>{children}</span>
    </div>
  );
}

function Vacio() {
  return <span className="text-[#c4c3bd]">—</span>;
}

/**
 * Para qué se compró: solo lo que está cargado en los renglones. La nota de la factura
 * mezcla datos de control y queda en el detalle; si no hay para qué, la línea lo marca.
 */
function paraQue(items: { para_que: string | null }[]): string | null {
  const dichos = [...new Set(items.map((i) => i.para_que?.trim()).filter((x): x is string => !!x))];
  return dichos.length ? dichos.join(" · ") : null;
}

/**
 * El renglón como se lee: sin el código interno, sin la marca, sin los signos que
 * quedan de una mala lectura del PDF y sin todo en mayúsculas.
 */
function limpiarItem(s: string): string {
  const t = s.replace(/\s*\(código[^)]*\)/i, "").split(" - ")[0].replace(/[?�]/g, "").replace(/\s+/g, " ").trim();
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letras && letras === letras.toUpperCase()) {
    const bajo = t.toLowerCase();
    return bajo.charAt(0).toUpperCase() + bajo.slice(1);
  }
  return t;
}

function resumenItems(items: string[]): string {
  const unicos = [...new Set(items.map(limpiarItem))];
  const resto = unicos.length - 2;
  return unicos.slice(0, 2).join(", ") + (resto > 0 ? ` y ${resto} más` : "");
}

/** Quién retiró y quién autorizó, de los remitos; si no hay, quién retiró según la factura. */
function quien(remitos: { retiro_por: string | null; autorizo: string | null }[], retiroFactura: string | null | undefined): string | null {
  const retiro = [...new Set(remitos.map((r) => r.retiro_por).filter((x): x is string => !!x))];
  const autorizo = [...new Set(remitos.map((r) => r.autorizo).filter((x): x is string => !!x))];
  if (!retiro.length && retiroFactura) retiro.push(retiroFactura);
  const partes = [retiro.length ? `Retiró ${retiro.join(", ")}` : null, autorizo.length ? `autorizó ${autorizo.join(", ")}` : null];
  return partes.filter(Boolean).join(" · ") || null;
}

/** Un chequeo de la línea: verde si está, ámbar si falta. */
function Chequeo({ ok, icon: Icon, title, children }: { ok?: boolean; icon: LucideIcon; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-[2px] text-[11.5px] font-medium ${
      ok ? "bg-[#f0f6f2] text-[#0f2a1f]" : "bg-[#fffbeb] text-[#92400e]"
    }`}>
      <Icon className="h-3 w-3" strokeWidth={2.2} /> {children}
    </span>
  );
}
