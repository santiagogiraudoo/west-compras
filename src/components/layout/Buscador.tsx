"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, Loader2, Receipt, Search, Truck, Users, type LucideIcon } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buscarTodo } from "@/app/(app)/buscar/actions";
import type { Resultado, TipoResultado } from "@/lib/buscar/queries";
import { cn } from "@/lib/utils";

const GRUPOS: { tipo: TipoResultado; titulo: string; icon: LucideIcon }[] = [
  { tipo: "proveedor", titulo: "Proveedores", icon: Users },
  { tipo: "factura", titulo: "Facturas", icon: Receipt },
  { tipo: "op", titulo: "Órdenes de pago", icon: FileText },
  { tipo: "remito", titulo: "Remitos", icon: Truck },
  { tipo: "unidad", titulo: "Unidades", icon: Building2 },
];

/**
 * El buscador de toda la app (como el de Central de pagos): factura, OP, remito, CUIT o
 * proveedor. Se abre con Ctrl+K (⌘K en Mac) o con el botón del menú; Enter abre el elegido.
 */
export function Buscador({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, startTransition] = useTransition();

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setAbierto((v) => !v);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  // Busca un ratito después de dejar de escribir, para no pedir una consulta por letra.
  useEffect(() => {
    const t = setTimeout(() => {
      startTransition(async () => setResultados(q.trim().length >= 2 ? await buscarTodo(q) : []));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function abrir(r: Resultado) {
    setAbierto(false);
    setQ("");
    router.push(r.href);
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md bg-sidebar-accent/60 px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-2",
        )}
        aria-label="Buscar">
        <Search className="h-4 w-4 shrink-0" />
        {!collapsed && <><span className="flex-1 text-left">Buscar…</span><kbd className="rounded bg-white/10 px-1.5 text-[10px] font-medium">Ctrl K</kbd></>}
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Buscar</DialogTitle>
            <DialogDescription>Factura, OP, remito, CUIT o proveedor</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[#B8960C]">
            <CommandInput value={q} onValueChange={setQ} placeholder="Buscar factura, OP, remito, CUIT o proveedor" />
            <CommandList className="max-h-[60vh]">
              {q.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Escribí al menos 2 letras o números. Ej.: 8897, Defer, 20-32502058.</p>
              ) : (
                <CommandEmpty>
                  {buscando ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</span> : "No encontré nada con eso."}
                </CommandEmpty>
              )}
              {GRUPOS.map((g) => {
                const lista = resultados.filter((r) => r.tipo === g.tipo);
                if (lista.length === 0) return null;
                return (
                  <CommandGroup key={g.tipo} heading={g.titulo}>
                    {lista.map((r) => (
                      <CommandItem key={`${r.tipo}-${r.href}-${r.titulo}`} value={`${r.tipo}-${r.href}-${r.titulo}`} onSelect={() => abrir(r)} className="gap-3">
                        <g.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.titulo}</span>
                          <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
