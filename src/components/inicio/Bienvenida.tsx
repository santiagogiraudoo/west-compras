import Link from "next/link";
import { ArrowRight, Banknote, ChevronRight, ClipboardCheck, FilePlus, Inbox, Sparkles, type LucideIcon } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";

/**
 * La cabecera del Inicio: saludo, el día, una frase con lo importante y accesos a lo que
 * más se usa. Verde de West con el dorado de acento, como las fichas de alquileres.
 */
export function Bienvenida({ nombre, hoy, hora, frase, accesos }: {
  nombre: string; hoy: string; hora: number; frase: React.ReactNode;
  accesos: { href: string; label: string; n: number; icon: LucideIcon }[];
}) {
  const saludo = hora < 6 ? "Buenas noches" : hora < 13 ? "Buen día" : hora < 20 ? "Buenas tardes" : "Buenas noches";
  const dia = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${hoy}T12:00:00Z`));
  return (
    <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1B4332] via-[#1f4d3a] to-[#2d6a4f] px-6 py-5 text-white shadow-sm">
      {/* Un par de círculos dorados de fondo, apenas */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#B8960C]/20 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 right-40 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#e9d27a]">
            <Sparkles className="h-3.5 w-3.5" /> {dia}
          </p>
          <h1 className="text-[26px] font-semibold leading-tight">{saludo}, {nombre}</h1>
          <p className="max-w-xl text-[14px] text-white/80">{frase}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {accesos.map((a) => (
            <Link key={a.href} href={a.href}
              className="group flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[13px] font-medium ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20">
              <a.icon className="h-4 w-4 text-[#e9d27a]" /> {a.label}
              {a.n > 0 && <span className="rounded-full bg-[#B8960C] px-1.5 text-[11px] font-semibold leading-5 text-white">{a.n}</span>}
              <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export interface Paso { href: string; label: string; n: number; monto: string; nota: string; icon: LucideIcon; tono: string }

/** El flujo de compras en una fila: cuánto hay en cada paso, y un clic para ir a resolverlo. */
export function Flujo({ pasos }: { pasos: Paso[] }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {pasos.map((p, i) => (
        <Link key={p.href} href={p.href}
          className="group relative flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4 transition hover:-translate-y-0.5 hover:border-[#B8960C]/50 hover:shadow-md">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${p.tono}`}><p.icon className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="text-[10px] font-semibold text-[#B8960C]">{i + 1}</span> {p.label}
            </p>
            <p className="text-2xl font-semibold leading-8 text-primary tabular-nums">{p.n}</p>
            <p className="truncate text-xs text-muted-foreground">
              {Number(p.monto) !== 0 && <><MoneyCell value={Number(p.monto)} currency="ARS" decimals={0} className="font-medium text-foreground" /> · </>}{p.nota}
            </p>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 text-[#c4c3bd] transition group-hover:translate-x-0.5 group-hover:text-[#B8960C]" />
        </Link>
      ))}
    </section>
  );
}

export const ICONOS = { Inbox, FilePlus, ClipboardCheck, Banknote };
