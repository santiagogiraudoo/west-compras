import { AlertTriangle, Bot, FileSearch, ScanLine, Sparkles, CheckCircle, CircleDashed, Clock, FlaskConical, Moon, PauseCircle, type LucideIcon } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/shared/StatusPill";
import { estadoGeneral, estadoProceso, QUE_HACE, type EstadoProceso } from "@/lib/plomero/estado";
import { ahoraEnMendoza, documentosPendientes, erroresPlomero, hechoPlomero, iaFacturas, procesosPlomero, ultimaCorrida } from "@/lib/plomero/queries";

export const dynamic = "force-dynamic";

const PILL: Record<EstadoProceso, { tone: PillTone; label: string; icon: LucideIcon }> = {
  ok: { tone: "success", label: "Anda", icon: CheckCircle },
  error: { tone: "red", label: "Con error", icon: AlertTriangle },
  prueba: { tone: "indigo", label: "En prueba", icon: FlaskConical },
  quieto: { tone: "amber", label: "No corrió hoy", icon: PauseCircle },
};
const GENERAL = {
  Andando: { clase: "from-[#1B4332] to-[#2d6a4f]", icon: Bot, frase: "Está corriendo: carga facturas, OP y pagos cada hora." },
  Descansa: { clase: "from-[#3f4a45] to-[#5b6660]", icon: Moon, frase: "Fuera de horario: corre de lunes a viernes de 8 a 20." },
  Parado: { clase: "from-[#991b1b] to-[#b91c1c]", icon: PauseCircle, frase: "En horario y sin correr hace más de 75 minutos: avisale a Adriano." },
} as const;

/** Hace cuánto, en palabras cortas. */
function hace(iso: string, ahora: number): string {
  if (!iso) return "—";
  const min = Math.round((ahora - Date.parse(iso)) / 60_000);
  if (min < 60) return `hace ${Math.max(0, min)} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

/**
 * El plomero: el bot de Adriano (santiagogiraudoo/west-plomero) que lee los mails de
 * facturas, las procesa con QR e IA, arma OP, registra pagos y archiva. La app no lo
 * maneja: muestra cómo está, qué hizo y qué falló, leyendo cc.ejecuciones y cc.log_cargas.
 */
export default async function PlomeroPage() {
  const [procesos, ultima, hecho, errores, ia, pendientes] = await Promise.all([
    procesosPlomero(), ultimaCorrida(), hechoPlomero(7), erroresPlomero(), iaFacturas(), documentosPendientes(),
  ]);
  const pct = (n: number) => (ia.leidas ? Math.round((n / ia.leidas) * 100) : 0);
  const cifrasIA = [
    { k: "Leídas", v: String(ia.leidas), nota: `${ia.no_factura} no eran factura`, alerta: false },
    { k: "Cargadas", v: String(ia.cargadas), nota: "el resto ya estaba cargado", alerta: false },
    { k: "Sin QR", v: `${pct(ia.sin_qr)} %`, nota: "solo IA, sin el control del QR", alerta: pct(ia.sin_qr) > 50 },
    { k: "Con alertas", v: `${pct(ia.con_alertas)} %`, nota: "dudas o totales que no cierran", alerta: pct(ia.con_alertas) > 50 },
  ];
  const { ahora, hora, dia } = ahoraEnMendoza();
  const general = estadoGeneral(ultima, new Date(ahora).toISOString(), hora, dia);
  const g = GENERAL[general];
  const reales = procesos.filter((p) => p.modo === "real");
  const enPrueba = procesos.filter((p) => p.modo !== "real" && !reales.some((r) => r.proceso === p.proceso));
  const sinResolver = errores.filter((e) => !e.resuelto);
  const dias = [...new Set(hecho.map((h) => h.dia))];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-6">
      <section className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${g.clase} px-6 py-5 text-white`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15"><g.icon className="h-6 w-6" /></div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">El plomero</p>
              <h1 className="text-2xl font-semibold">{general}</h1>
              <p className="text-sm text-white/80">{g.frase}</p>
              {/* La base de desarrollo es una copia: ahí el plomero nunca corre. */}
              {ultima && ahora - Date.parse(ultima) > 24 * 3600_000 && (
                <p className="mt-1 text-xs text-white/70">Si estás en la base de prueba es normal: es una copia y el plomero escribe solo en producción.</p>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-white/85">
            <p className="flex items-center justify-end gap-1.5"><Clock className="h-4 w-4" /> última corrida {ultima ? hace(ultima, ahora) : "nunca"}</p>
            <p>{sinResolver.length ? `${sinResolver.length} errores sin resolver` : "sin errores pendientes"}</p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-primary">Procesos <span className="text-xs font-normal text-muted-foreground">· cada uno es una tarea del plomero</span></h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...reales, ...enPrueba].map((p) => {
            const e = estadoProceso(p);
            const pill = PILL[e];
            return (
              <div key={`${p.proceso}-${p.modo}`} className={`rounded-lg border bg-[#FFFEFC] p-4 ${e === "error" ? "border-red-200" : "border-border/60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold capitalize text-primary">{p.proceso.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">{QUE_HACE[p.proceso] ?? "—"}</p>
                  </div>
                  <StatusPill tone={pill.tone} icon={pill.icon} className="whitespace-nowrap">{pill.label}</StatusPill>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-muted-foreground">Última</dt><dd className="font-medium">{hace(p.ultima, ahora)}</dd></div>
                  <div><dt className="text-muted-foreground">Corridas 24 h</dt><dd className="font-medium">{p.corr24}</dd></div>
                  <div><dt className="text-muted-foreground">Errores 7 d</dt><dd className={`font-medium ${p.err7 ? "text-red-700" : ""}`}>{p.err7}</dd></div>
                </dl>
                <p className="mt-2 text-[11.5px] text-muted-foreground">
                  {p.resultado === "sin novedades" ? "Última corrida sin novedades" : `Última: ${p.resultado}`}
                  {p.ultima_novedad ? ` · hizo algo ${hace(p.ultima_novedad, ahora)}` : ""}
                </p>
                {p.error && <p className="mt-2 rounded-md bg-[#fef2f2] px-2 py-1.5 text-[12px] text-[#991b1b]">{p.error}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* La IA leyendo facturas: QR de ARCA primero, Claude para lo demás */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4 text-[#B8960C]" /> La IA leyendo facturas <span className="font-normal text-muted-foreground">· 30 días</span>
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Lee el QR de ARCA y, para el resto, Claude (Haiku si el PDF tiene texto, Sonnet si es foto). El QR manda en CUIT, número y total.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cifrasIA.map((c) => (
              <div key={c.k} className="rounded-md bg-white p-3 ring-1 ring-[#f0efe9]">
                <p className="text-[11px] text-muted-foreground">{c.k}</p>
                <p className={c.alerta ? "text-xl font-semibold tabular-nums text-[#b45309]" : "text-xl font-semibold tabular-nums text-primary"}>{c.v}</p>
                <p className="text-[11px] text-muted-foreground">{c.nota}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <ScanLine className="h-3.5 w-3.5" /> Gastó {ia.tokens_entrada.toLocaleString("es-AR")} tokens de entrada y {ia.tokens_salida.toLocaleString("es-AR")} de salida.
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <FileSearch className="h-4 w-4" /> Para revisar a mano <span className="font-normal text-muted-foreground">· {pendientes.length}</span>
          </h2>
          {pendientes.length === 0 ? <p className="text-sm text-muted-foreground">Nada: todo lo que llegó se pudo cargar.</p> : (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {pendientes.map((d, i) => (
                <li key={i} className="text-[12.5px]">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate font-medium" title={d.nombre ?? ""}>{d.nombre ?? "sin nombre"}</span>
                    <StatusPill tone={d.estado === "ilegible" ? "red" : "amber"} className="ml-auto whitespace-nowrap">{d.estado === "ilegible" ? "Ilegible" : "Revisar"}</StatusPill>
                  </div>
                  {d.motivo && <p className="line-clamp-2 text-[11.5px] text-muted-foreground">{d.motivo}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <h2 className="mb-3 text-sm font-semibold text-primary">Lo que hizo <span className="font-normal text-muted-foreground">· últimos 7 días</span></h2>
          {dias.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CircleDashed className="h-4 w-4" /> No registró trabajo en la última semana.</p> : (
            <div className="space-y-3">
              {dias.map((d) => (
                <div key={d}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">
                    {new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}
                  </p>
                  <ul className="space-y-1">
                    {hecho.filter((h) => h.dia === d).map((h) => (
                      <li key={h.tipo} className="flex gap-2 text-[13px]">
                        <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-primary">{h.n}</span>
                        <span className="min-w-0"><span className="font-medium">{h.tipo}</span>
                          {h.ejemplos && <span className="block truncate text-[11.5px] text-muted-foreground" title={h.ejemplos}>{h.ejemplos}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <h2 className="mb-3 text-sm font-semibold text-primary">Errores <span className="font-normal text-muted-foreground">· últimos 14 días</span></h2>
          {errores.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle className="h-4 w-4 text-emerald-600" /> Ningún error.</p> : (
            <ul className="divide-y divide-[#f2f1ec]">
              {errores.map((e, i) => (
                <li key={i} className="py-2 text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{e.proceso}</span>
                    <span className="text-xs text-muted-foreground">{e.cuando.slice(8, 10)}/{e.cuando.slice(5, 7)} {e.cuando.slice(11)}</span>
                    <span className="ml-auto">{e.resuelto ? <StatusPill tone="neutral">Resuelto</StatusPill> : <StatusPill tone="red" icon={AlertTriangle}>Pendiente</StatusPill>}</span>
                  </div>
                  <p className={`mt-0.5 line-clamp-2 text-[12px] ${e.resuelto ? "text-muted-foreground" : "text-[#991b1b]"}`}>{e.motivo}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
