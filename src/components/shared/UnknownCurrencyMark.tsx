"use client";

import { TriangleAlert } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Marca de "no se en que moneda esta este numero". Sale sola cuando el dato
 * que llego no es ARS ni USD, que despues de hacer la moneda obligatoria solo
 * puede pasar por una anomalia de datos, no por un olvido del caller.
 *
 * Mismo patron que AdendaIndicator: icono chico dentro de un Tooltip. Ambar
 * #f59e0b es el token del sistema para "requiere atencion".
 */
export function UnknownCurrencyMark() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center justify-center cursor-help"
            aria-label="Monto sin moneda conocida"
          >
            <TriangleAlert className="h-3 w-3 text-[#f59e0b] shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p>Sin moneda conocida — el monto se muestra sin simbolo.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
