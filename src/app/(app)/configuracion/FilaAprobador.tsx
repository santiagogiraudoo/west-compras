"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { guardarAprobador } from "./actions";

interface Props {
  unidad: string;
  nombre: string;
  usuarioId: number | null;
  topeCompra: string | null;
  topeMes: string | null;
  usuarios: { id: number; name: string }[];
  edita: boolean;
}

/** Una unidad y quién la aprueba. Los topes (USD blue) se guardan pero todavía no se usan. */
export function FilaAprobador({ unidad, nombre, usuarioId, topeCompra, topeMes, usuarios, edita }: Props) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [usuario, setUsuario] = useState(usuarioId ? String(usuarioId) : "");
  const [tc, setTc] = useState(topeCompra ?? "");
  const [tm, setTm] = useState(topeMes ?? "");
  const cambio = usuario !== (usuarioId ? String(usuarioId) : "") || tc !== (topeCompra ?? "") || tm !== (topeMes ?? "");

  function guardar() {
    start(async () => {
      const r = await guardarAprobador(unidad, Number(usuario), tc, tm);
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      router.refresh();
    });
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-1.5"><span className="text-muted-foreground">{unidad}</span> {nombre}</td>
      <td className="px-2 py-1.5">
        <Select value={usuario} onValueChange={setUsuario} disabled={!edita}>
          <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Sin aprobador (un admin)" /></SelectTrigger>
          <SelectContent>{usuarios.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1.5"><Input className="h-8 w-28" value={tc} onChange={(e) => setTc(e.target.value)} disabled={!edita} placeholder="—" inputMode="decimal" /></td>
      <td className="px-2 py-1.5"><Input className="h-8 w-28" value={tm} onChange={(e) => setTm(e.target.value)} disabled={!edita} placeholder="—" inputMode="decimal" /></td>
      <td className="px-4 py-1.5 text-right">
        {edita && (
          <Button size="sm" variant="outline" disabled={!cambio || !usuario || pendiente} onClick={guardar}>
            <Save className="h-4 w-4" /> Guardar
          </Button>
        )}
      </td>
    </tr>
  );
}
