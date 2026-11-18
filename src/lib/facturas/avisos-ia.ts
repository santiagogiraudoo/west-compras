/**
 * Lo que el plomero no pudo leer seguro de una factura. Lo deja en la descripción como
 * "[plomero] … · ⚠️ falta unidad · ⚠️ revisar: el total no cierra · Nota: …": cada aviso
 * es un tramo (separado por " · ") que empieza con ⚠️. Sin "[plomero]" no hay avisos.
 */
export function avisosIA(descripcion: string | null | undefined): string[] {
  if (!descripcion || !descripcion.includes("[plomero]")) return [];
  const avisos = descripcion
    .split(" · ")
    .map((t) => t.trim())
    .filter((t) => t.startsWith("⚠️"))
    .map((t) => t.replace(/^⚠️\s*/, "").replace(/^revisar:\s*/i, "").trim())
    .filter(Boolean);
  return [...new Set(avisos)];
}
