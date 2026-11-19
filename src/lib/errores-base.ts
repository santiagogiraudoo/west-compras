/**
 * Los frenos de la base (constraints) hablan en inglés técnico. Esto los traduce a lo
 * que pasó, para mostrarlo tal cual en la pantalla. Lo que no se reconoce pasa sin tocar:
 * los raise exception de las funciones y triggers de cc ya vienen en español.
 */
const FRENOS: [RegExp, string][] = [
  [/comprobante_unico_clave|comprobante_unico/, "Ese comprobante ya está cargado para ese proveedor (quizás con el número escrito distinto)"],
  [/vencimiento_despues_de_fecha/, "El vencimiento no puede ser anterior a la fecha de la factura"],
  [/total_cuadra/, "El total no cierra con neto + IVA + percepciones (menos de $1)"],
  [/comprobantes_signo_check/, "La nota de crédito va en negativo y el resto en positivo"],
  [/comprobantes_tipo_check/, "Ese tipo de comprobante no existe en la base"],
  [/comprobantes_titular_fk/, "Ese titular no está en la lista de titulares"],
  [/proveedores_cuit_key/, "Ya hay un proveedor con ese CUIT"],
  [/proveedores_cuit_formato/, "El CUIT tiene que ser 99-99999999-9"],
  [/imputacion_unica/, "Esa factura ya está en esta OP"],
];

export function mensajeBase(error: string): string {
  for (const [re, msg] of FRENOS) if (re.test(error)) return msg;
  return error;
}
