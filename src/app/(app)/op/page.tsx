import Link from "next/link";
import Decimal from "decimal.js";
import {
  Archive, Banknote, CheckCircle, FileWarning, TriangleAlert, Clock, FilePlus, ListChecks, MessageSquareWarning, PenLine, Users, Workflow, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { Copiar } from "@/components/shared/Copiar";
import { FichaCard, FichaLabel } from "@/components/properties/FichaCard";
import { TarjetaOP } from "@/components/op/TarjetaOP";
import { PagarOP } from "@/components/op/PagarOP";
import { PasosOP, type Paso, type PasoInfo } from "@/components/op/flujo/PasosOP";
import { Seccion, TablaCerradas, TablaEnArmado, Vacio } from "@/components/op/flujo/TablaOP";
import { formatDate } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { hoyArgentina, listarAbiertos, listarOPAbiertas } from "@/lib/cuenta/queries";
import { aResolver, decide, diasEntre } from "@/lib/op/estados";
import { contextoProveedores, facturasDeOP, listarCerradas, listarOPsApp, listarPagados, type OPConLineas } from "@/lib/op/queries";
import { Historico } from "@/components/op/flujo/Historico";
import { problemasOP } from "@/lib/op/controles";
import { prisma } from "@/lib/prisma";
import { medioSugerido, vencimientoOP } from "@/lib/op/pago";

export const dynamic = "force-dynamic";

const PASOS: Paso[] = ["armar", "aprobar", "pagar", "pagadas", "clickup"];
const suma = (vs: string[]) => vs.reduce((t, v) => t.plus(v), new Decimal(0)).toFixed(2);

/**
 * Órdenes de pago: todo el circuito en una página. 1 Armar (facturas aprobadas sin OP y
 * OP en armado) → 2 Aprobar (cada factura la firma quien aprueba su unidad) → 3 Pagar (OP
 * autorizadas, se sube el comprobante) → Pagadas. Aparte, las previstas que siguen en
 * ClickUp. El paso va en la URL (?paso=…); sin paso, se abre donde le toca hacer algo a
 * quien entra.
 */
export default async function OPPage({ searchParams }: { searchParams: Promise<{ paso?: string; mes?: string; q?: string }> }) {
  const { paso: pedido, mes: mesPedido, q } = await searchParams;
  const hoy = hoyArgentina();
  const mesActual = hoy.slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(mesPedido ?? "") && mesPedido! <= mesActual ? mesPedido! : mesActual;
  const [session, ops, abiertos, cerradas, deClickUp, pagados] = await Promise.all([
    auth(), listarOPsApp(), listarAbiertos(), listarCerradas(hoy), listarOPAbiertas(), listarPagados(mes),
  ]);
  const descartadas = cerradas.filter((o) => o.estado === "Descartada");
  const usuario = { id: (session?.user as { id: number } | undefined)?.id ?? 0, role: session?.user?.role ?? "consulta" };
  const edita = usuario.role !== "consulta";

  const enArmado = ops.filter((o) => o.estado === "En armado");
  const enAprobacion = ops.filter((o) => ["A aprobar", "Observada", "Bloqueada"].includes(o.estado));
  const autorizadas = ops.filter((o) => o.estado === "Autorizada")
    .map((o) => ({ ...o, vence: vencimientoOP(o.lineas) }))
    .sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999"));
  const libres = porProveedor(abiertos.filter((a) => Number(a.libre) > 0.5));
  const teToca = enAprobacion.filter((o) => o.estado === "A aprobar" && o.lineas.some((l) => decide(l, usuario) && !l.decision));
  // Lo que frena cada OP viva (factura anulada, la misma en ClickUp, imputada de más):
  // se avisa en la tarjeta y la base lo vuelve a frenar al pagar.
  const vivas = [...enArmado, ...enAprobacion, ...autorizadas];
  const frenos = Object.fromEntries(await Promise.all(vivas.map(async (o) => [o.numero, problemasOP(await facturasDeOP(prisma, o.numero))] as const)));

  const pasos: PasoInfo[] = [
    { clave: "armar", numero: 1, label: "Armar", icon: FilePlus, n: enArmado.length + libres.length,
      total: suma([...libres.map((p) => p.libre), ...enArmado.map((o) => o.total_imputado)]),
      aviso: enArmado.length ? `${enArmado.length} sin mandar a aprobar` : undefined },
    { clave: "aprobar", numero: 2, label: "Aprobar", icon: ListChecks, n: enAprobacion.length, total: suma(enAprobacion.map((o) => o.total_imputado)),
      aviso: teToca.length ? `te toca firmar ${teToca.length}` : undefined },
    { clave: "pagar", numero: 3, label: "Pagar", icon: Banknote, n: autorizadas.length, total: suma(autorizadas.map((o) => o.total_imputado)) },
    { clave: "pagadas", label: "Pagadas", icon: Archive, n: pagados.length, total: "0" },
    { clave: "clickup", label: "ClickUp", icon: Workflow, n: deClickUp.length, total: "0" },
  ];
  // Sin paso en la URL: donde le toca hacer algo (firmar, pagar), si no, armar.
  const activo: Paso = PASOS.includes(pedido as Paso) ? (pedido as Paso)
    : teToca.length ? "aprobar" : enArmado.length || libres.length ? "armar" : autorizadas.length ? "pagar" : "armar";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Órdenes de pago</h1>
          <p className="text-sm text-muted-foreground">
            Se arma con facturas aprobadas, la firma quien aprueba cada unidad y, autorizada, se paga. Todo acá.
          </p>
        </div>
        {edita && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/op/extraordinaria"><FileWarning className="h-4 w-4" /> Operación extraordinaria</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/op/nueva"><FilePlus className="h-4 w-4" /> Plan de pagos</Link>
            </Button>
          </div>
        )}
      </div>

      <PasosOP pasos={pasos} activo={activo} />

      {activo === "armar" && (
        <div className="space-y-6">
          <Seccion titulo="En armado" n={enArmado.length} ayuda="Armadas, falta mandarlas a aprobar." total={suma(enArmado.map((o) => o.total_imputado))}>
            {enArmado.length ? <TablaEnArmado ops={enArmado} hoy={hoy} puede={edita} /> : <Vacio>No hay OP en armado.</Vacio>}
          </Seccion>
          <Seccion titulo="Facturas aprobadas sin OP" n={libres.length} ayuda="Por proveedor; la que vence primero arriba. Tocá uno para armarle la OP."
            total={suma(libres.map((p) => p.libre))}>
            {libres.length ? <TablaLibres libres={libres} hoy={hoy} puede={edita} /> : <Vacio>Todas las facturas aprobadas ya están en una OP.</Vacio>}
          </Seccion>
        </div>
      )}

      {activo === "aprobar" && <PasoAprobar ops={enAprobacion} usuario={usuario} hoy={hoy} frenos={frenos} />}

      {activo === "pagar" && (
        <Seccion titulo="Autorizadas" n={autorizadas.length} ayuda="La que vence primero arriba. Al registrar el pago se sube el comprobante y se lee solo."
          total={suma(autorizadas.map((o) => o.total_imputado))}>
          {autorizadas.length === 0 ? <Vacio>No hay OP autorizadas para pagar.</Vacio> : (
            <div className="space-y-4">
              {autorizadas.map((o) => <TarjetaPago key={o.numero} o={o} hoy={hoy} paga={edita} problemas={frenos[o.numero] ?? []} />)}
            </div>
          )}
        </Seccion>
      )}

      {activo === "pagadas" && (
        <div className="space-y-8">
          <Historico pagados={pagados} mes={mes} hoy={hoy} q={q ?? ""} />
          {descartadas.length > 0 && (
            <Seccion titulo="Descartadas en la app" n={descartadas.length} ayuda="De los últimos 60 días, con el motivo. Sus facturas quedaron libres.">
              <TablaCerradas ops={descartadas} />
            </Seccion>
          )}
        </div>
      )}

      {activo === "clickup" && (
        <Seccion titulo="Previstas en ClickUp" n={deClickUp.length} ayuda="Se aprueban y pagan allá hasta que se apaguen las listas Pagos y CC."
          total={suma(deClickUp.map((o) => o.total_imputado))}>
          {deClickUp.length === 0 ? <Vacio>No hay OP previstas en ClickUp con facturas de West.</Vacio> : (
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="border-b bg-[#fafaf7] text-left text-xs font-semibold uppercase tracking-wide text-[#B8960C]">
                  <tr><th className="px-3 py-2">OP</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">En ClickUp</th><th className="px-3 py-2 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-[#f2f1ec]">
                  {deClickUp.map((o) => (
                    <tr key={o.numero}>
                      <td className="px-3 py-2.5 font-semibold">{o.numero}</td>
                      <td className="px-3 py-2.5">{o.razon_social}</td>
                      <td className="px-3 py-2.5">{formatDate(o.fecha_op)}</td>
                      <td className="px-3 py-2.5"><StatusPill tone="neutral">{o.estado_clickup ?? o.estado}</StatusPill></td>
                      <td className="px-3 py-2.5 text-right"><MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      )}
    </div>
  );
}

interface Libre { codigo: string; nombre: string; libre: string; n: number; vence: string | null }

/** Facturas libres por proveedor: cuánto, cuántas y el vencimiento más próximo. */
function porProveedor(abiertos: Awaited<ReturnType<typeof listarAbiertos>>): Libre[] {
  const m = new Map<string, { nombre: string; libre: Decimal; n: number; vence: string | null }>();
  for (const a of abiertos) {
    const p = m.get(a.proveedor_codigo) ?? { nombre: a.razon_social, libre: new Decimal(0), n: 0, vence: null };
    p.libre = p.libre.plus(a.libre);
    p.n += 1;
    if (a.vencimiento && (!p.vence || a.vencimiento < p.vence)) p.vence = a.vencimiento;
    m.set(a.proveedor_codigo, p);
  }
  return [...m].filter(([, p]) => p.libre.greaterThan(0.5))
    .map(([codigo, p]) => ({ codigo, nombre: p.nombre, libre: p.libre.toFixed(2), n: p.n, vence: p.vence }))
    .sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999"));
}

function TablaLibres({ libres, hoy, puede }: { libres: Libre[]; hoy: string; puede: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead className="border-b bg-[#fafaf7] text-left text-xs font-semibold uppercase tracking-wide text-[#B8960C]">
          <tr><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Facturas</th><th className="px-3 py-2">Vence la primera</th><th className="px-3 py-2 text-right">Libre para OP</th><th /></tr>
        </thead>
        <tbody className="divide-y divide-[#f2f1ec]">
          {libres.map((p) => (
            <tr key={p.codigo} className="hover:bg-[#fafaf7]">
              <td className="px-3 py-2.5"><Link href={`/cuenta/${p.codigo}`} className="font-medium text-primary underline-offset-2 hover:underline">{p.nombre}</Link></td>
              <td className="px-3 py-2.5">{p.n}</td>
              <td className={`px-3 py-2.5 ${p.vence && p.vence < hoy ? "font-medium text-[#b91c1c]" : ""}`}>{p.vence ? formatDate(p.vence) : "—"}</td>
              <td className="px-3 py-2.5 text-right font-semibold"><MoneyCell value={Number(p.libre)} currency="ARS" decimals={0} /></td>
              <td className="px-3 py-2 text-right">
                {puede && (
                  <Button size="sm" variant="outline" className="h-7" asChild>
                    <Link href={`/op/nueva?proveedor=${p.codigo}`}><FilePlus className="h-3.5 w-3.5" /> Armar OP</Link>
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Paso 2: una tarjeta por OP. Arriba lo que le toca a quien entra (facturas de sus
 * unidades sin decidir); después las observadas y bloqueadas; al final lo que espera a otros.
 */
async function PasoAprobar({ ops, usuario, hoy, frenos }: {
  ops: OPConLineas[]; usuario: { id: number; role: string }; hoy: string; frenos: Record<string, string[]>;
}) {
  const { deuda, ultimas } = await contextoProveedores([...new Set(ops.map((o) => o.proveedor_codigo))]);
  const teToca = ops.filter((o) => o.estado === "A aprobar" && o.lineas.some((l) => decide(l, usuario) && !l.decision));
  const puedeResolver = (o: OPConLineas) => o.lineas.some((l) => decide(l, usuario) || aResolver(l, usuario));
  const frenadas = ops.filter((o) => o.estado !== "A aprobar").sort((a, b) => Number(puedeResolver(b)) - Number(puedeResolver(a)));
  const deOtros = ops.filter((o) => !teToca.includes(o) && !frenadas.includes(o));
  const aFirmar = teToca.flatMap((o) => o.lineas.filter((l) => decide(l, usuario) && !l.decision)).reduce((t, l) => t.plus(l.importe), new Decimal(0));
  const masVieja = Math.max(0, ...teToca.map((o) => (o.enviada_en ? diasEntre(o.enviada_en, hoy) : 0)));

  const resumen: { label: string; v: React.ReactNode; nota: string; icon: LucideIcon; tono: string }[] = [
    { label: "Te toca firmar", v: <MoneyCell value={aFirmar.toNumber()} currency="ARS" decimals={0} />, nota: `${teToca.length} OP`,
      icon: PenLine, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { label: "Espera hace", v: teToca.length === 0 ? "—" : masVieja === 0 ? "hoy" : `${masVieja} ${masVieja === 1 ? "día" : "días"}`,
      nota: teToca.length === 0 ? "no tenés nada para firmar" : "lo más viejo tuyo", icon: Clock, tono: masVieja >= 3 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600" },
    { label: "Frenadas", v: String(frenadas.length), nota: "observadas o bloqueadas", icon: MessageSquareWarning,
      tono: frenadas.length ? "bg-orange-50 text-orange-600" : "bg-emerald-50 text-emerald-600" },
    { label: "Esperando a otros", v: String(deOtros.length), nota: "nada tuyo para decidir", icon: Users, tono: "bg-emerald-50 text-emerald-600" },
  ];
  const lista = (l: OPConLineas[]) => l.map((o) => (
    <div key={o.numero} className="space-y-2">
      <Frenos problemas={frenos[o.numero] ?? []} numero={o.numero} />
      <TarjetaOP op={o} usuario={usuario} deuda={deuda[o.proveedor_codigo] ?? null} ultimas={ultimas[o.proveedor_codigo] ?? []} />
    </div>
  ));

  if (ops.length === 0) return <Vacio>No hay OP esperando aprobación.</Vacio>;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Cada factura la aprueba quien aprueba su unidad. Podés aprobar u observar una sola; una observada frena toda la OP.
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {resumen.map((c) => (
          <div key={c.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.tono}`}><c.icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <div className="truncate text-lg font-semibold text-primary">{c.v}</div>
              <p className="text-xs text-muted-foreground">{c.nota}</p>
            </div>
          </div>
        ))}
      </div>
      {teToca.length > 0 && <Seccion titulo="Te toca" n={teToca.length} ayuda="Facturas de tus unidades sin decidir. Si todo está en verde, se aprueba de un toque.">{lista(teToca)}</Seccion>}
      {frenadas.length > 0 && <Seccion titulo="Observadas y bloqueadas" n={frenadas.length} ayuda="Frenadas hasta que se resuelvan, se quite la observación o se descarten.">{lista(frenadas)}</Seccion>}
      {deOtros.length > 0 && <Seccion titulo="Esperando a otros" n={deOtros.length} ayuda="Lo tuyo ya está decidido o son de otras unidades.">{lista(deOtros)}</Seccion>}
    </div>
  );
}

/** Paso 3: la OP autorizada con la cuenta para copiar y el botón para registrar el pago. */
function TarjetaPago({ o, hoy, paga, problemas }: { o: OPConLineas & { vence: string | null }; hoy: string; paga: boolean; problemas: string[] }) {
  const vencida = o.vence != null && o.vence < hoy;
  const unidades = [...new Set(o.lineas.map((l) => l.unidad_nombre || l.unidad))].join(", ");
  return (
    <FichaCard icon={Banknote}
      title={<Link href={`/op/${o.numero}`} className="underline-offset-2 hover:underline">{o.numero}</Link>}
      barClassName={vencida ? "bg-[#b91c1c]" : undefined}
      actions={<span className="flex items-center gap-1 text-xs text-white/85"><CheckCircle className="h-3.5 w-3.5" /> autorizada · {vencida ? "vencida · " : ""}vence {o.vence ? formatDate(o.vence) : "—"}</span>}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-[#f2f1ec] px-5 py-4">
        <div className="min-w-0">
          <Link href={`/cuenta/${o.proveedor_codigo}`} className="text-[15px] font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline">{o.razon_social}</Link>
          <p className="mt-0.5 text-[12.5px] text-[#737373]">{unidades} · factura a {o.titular ?? "—"} · {o.lineas.length} {o.lineas.length === 1 ? "factura" : "facturas"}</p>
        </div>
        <div className="text-right">
          <FichaLabel>Total</FichaLabel>
          <MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={0} className="block text-[20px] font-semibold leading-7 text-primary" />
        </div>
      </div>
      {problemas.length > 0 && <div className="px-5 pt-4"><Frenos problemas={problemas} numero={o.numero} /></div>}
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <Dato k="CBU / CVU"><Copiar etiqueta="CBU" valor={o.cbu} /></Dato>
          <Dato k="Alias"><Copiar etiqueta="Alias" valor={o.alias} /></Dato>
          <Dato k="Titular de la cuenta"><Copiar etiqueta="Titular" valor={o.cuenta_titular} /></Dato>
          <Dato k="CUIT"><Copiar etiqueta="CUIT" valor={o.cuit} /></Dato>
          <Dato k="Banco">{o.banco ?? "—"}</Dato>
        </dl>
        {paga && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Antes de pagar todavía se puede volver atrás: en la ficha se quita una aprobación. */}
            <Link href={`/op/${o.numero}`} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline">
              Revisar facturas o quitar aprobación
            </Link>
            {problemas.length === 0 && <PagarOP numero={o.numero} proveedor={o.razon_social} total={o.total_imputado} medio={medioSugerido(o.medio_pago_habitual)} hoy={hoy} cbu={o.cbu} alias={o.alias} />}
          </div>
        )}
      </div>
    </FichaCard>
  );
}

/** Lo que frena una OP: no se puede pagar (ni mandar a aprobar) hasta resolverlo. */
function Frenos({ problemas, numero }: { problemas: string[]; numero: string }) {
  if (problemas.length === 0) return null;
  return (
    <div className="rounded-md border-l-[3px] border-l-[#dc2626] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#991b1b]">
      <p className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="h-4 w-4" /> {numero} no se puede pagar así</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{problemas.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">{k}</dt>
      <dd className="text-[13.5px]">{children}</dd>
    </div>
  );
}
