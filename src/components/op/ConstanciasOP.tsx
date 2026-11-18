"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, FileText, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FichaBarButton, FichaCard } from "@/components/properties/FichaCard";
import { subirConstancia } from "@/app/(app)/op/actions";
import type { Constancia } from "@/lib/op/constancias";

interface Props {
  numero: string;
  constancias: Constancia[];
  /** Quien es de consulta las ve pero no sube. */
  sube: boolean;
}

/** Lado más largo de una foto subida: alcanza para leer un remito y pesa poco. */
const LADO_MAX = 2000;

/**
 * Una foto del celular pesa varios MB: se achica en el navegador (JPG, lado mayor 2000 px)
 * antes de subirla. Los PDF y las fotos chicas van como están.
 */
async function achicar(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.size < 900 * 1024) return f;
  const bmp = await createImageBitmap(f);
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
  if (!blob) return f;
  return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** Constancias de la OP: fotos o PDF que alguien quiere dejar asentados, con nota opcional. */
export function ConstanciasOP({ numero, constancias, sube }: Props) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [pendiente, startTransition] = useTransition();
  const [nota, setNota] = useState("");

  function subir(archivos: FileList | null) {
    if (!archivos?.length) return;
    const lista = [...archivos];
    startTransition(async () => {
      let hechas = 0;
      for (const original of lista) {
        const f = await achicar(original);
        const form = new FormData();
        form.set("archivo", f);
        form.set("nota", nota);
        let r;
        try {
          r = await subirConstancia(numero, form);
        } catch {
          toast.error(`${original.name}: no se pudo subir. Probá de nuevo.`);
          break;
        }
        if (!r.ok) { toast.error(`${original.name}: ${r.mensaje}`); break; }
        hechas += 1;
      }
      if (hechas > 0) {
        toast.success(hechas === 1 ? "Constancia guardada" : `${hechas} constancias guardadas`);
        setNota("");
        router.refresh();
      }
      if (entrada.current) entrada.current.value = "";
    });
  }

  return (
    <FichaCard
      icon={Camera}
      title="Constancias"
      actions={sube ? (
        <FichaBarButton onClick={() => entrada.current?.click()} disabled={pendiente}>
          {pendiente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Agregar foto o PDF
        </FichaBarButton>
      ) : (
        <span className="text-xs text-white/75">{constancias.length}</span>
      )}
    >
      <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden"
        onChange={(e) => subir(e.target.files)} />

      {sube && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#f2f1ec] px-5 py-3">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500}
            placeholder="Nota para la próxima foto (opcional): ej. mercadería entregada en Iselin 90"
            className="h-8 max-w-xl flex-1 text-[13px]" />
          <Button size="sm" variant="outline" className="h-8" disabled={pendiente} onClick={() => entrada.current?.click()}>
            <ImagePlus className="h-4 w-4" /> Elegir archivos
          </Button>
        </div>
      )}

      {constancias.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-[#8a8a85]">
          Todavía no hay constancias. Sirven para dejar asentado lo que se vio al aprobar o pagar: la mercadería, un remito firmado, una charla.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {constancias.map((c) => {
            const href = `/op/${numero}/constancias/${c.id}`;
            return (
              <li key={c.id} className="overflow-hidden rounded-[8px] border border-[#eeede8] bg-[#fafaf7]">
                <a href={href} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-white">
                  {c.tipo.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la app
                    <img src={href} alt={c.nota ?? c.nombre} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-1 text-[#8a8a85]">
                      <FileText className="h-8 w-8" /> <span className="text-[11px] font-medium">PDF</span>
                    </span>
                  )}
                </a>
                <div className="space-y-0.5 px-2.5 py-2 text-[11.5px]">
                  {c.nota && <p className="line-clamp-2 text-foreground">{c.nota}</p>}
                  <p className="text-[#8a8a85]">{c.subido_por} · {c.subido_en}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </FichaCard>
  );
}
