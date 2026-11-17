/**
 * Una sola lista de categorías de gasto (Adriano 17/11, docs/proyecto/03_definiciones.md):
 * la de la app de alquileres, con Tasas en vez de ABL, más Obra e Insumos de oficina.
 * La base tiene la misma lista en el check de cc.comprobantes.categoria (sql/005).
 * El rubro no es una categoría: sale del proveedor y sirve para comparar precios.
 */
export const CATEGORIAS = [
  "Obra", "Reparaciones", "Mejoras", "Servicios", "Tasas", "Seguros",
  "Honorarios", "Comisiones", "Insumos de oficina", "Otros",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/** Unidades en construcción u obra: su gasto va a Obra por defecto. */
const UNIDADES_EN_OBRA = new Set(["UN-02", "UN-03", "UN-19", "UN-28", "UN-31"]);
const OFICINA = "UN-23";

/**
 * Categoría sugerida para una factura (03_definiciones: "sugerencia, editable en cada
 * factura"): obra → Obra; oficina → Insumos de oficina; combustible → Servicios; el resto
 * (propiedades alquiladas o para alquilar) → Reparaciones. Los contratistas siguen a la
 * unidad: en obra son Obra, si no Reparaciones.
 */
export function categoriaSugerida(unidad: string | null, rubroProveedor: string | null): Categoria | null {
  if (!unidad) return null;
  if (UNIDADES_EN_OBRA.has(unidad)) return "Obra";
  if (rubroProveedor === "Combustible") return "Servicios";
  if (unidad === OFICINA) return "Insumos de oficina";
  return "Reparaciones";
}
