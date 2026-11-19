/**
 * La nota de una factura (cc.comprobantes.descripcion) partida en renglones legibles.
 * Llega como un solo texto con tramos separados por " · " o " | " y agregados entre
 * corchetes ("[13/11 Adriano: …]"); cada tramo va en su renglón y la marca de quién la
 * cargó ("[plomero]") no se muestra. Solo forma: no cambia lo que dice.
 */
export function tramosDeNota(texto: string): string[] {
  const agregados: string[] = [];
  const cuerpo = texto
    .replace(/^\s*\[plomero\]\s*/i, "")
    .replace(/\[([^\]]+)\]/g, (_, dentro: string) => {
      agregados.push(dentro.trim());
      return " · ";
    });
  const tramos = cuerpo
    .split(/\s+[·|]\s+/)
    .map((t) => t.replace(/^[·|\s]+|[·|\s]+$/g, "").trim())
    .filter((t) => t.length > 0);
  return [...tramos, ...agregados];
}

export function NotaFactura({ texto, sinRenglones, className = "" }: {
  texto: string;
  /** Primer renglón de la factura: si la nota arranca repitiendo los renglones, ese tramo no se muestra. */
  sinRenglones?: string;
  className?: string;
}) {
  const primero = sinRenglones?.trim().toLowerCase();
  const tramos = tramosDeNota(texto).filter((t, i) => !(i === 0 && primero && t.toLowerCase().startsWith(primero)));
  if (tramos.length === 0) return null;
  return (
    <ul className={`space-y-1 text-[12.5px] leading-[18px] text-[#525252] ${className}`}>
      {tramos.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#c4c3bd]" />
          <span className="min-w-0 break-words">{t}</span>
        </li>
      ))}
    </ul>
  );
}
