import { z } from "zod";

/**
 * El esquema de lo que se lee de una factura (mismo que el plomero, documentos.py). Lo usa el
 * lector único del buzón (src/lib/entrada/leer.ts) para la parte "factura" del documento.
 */
const Item = z.object({
  descripcion: z.string(),
  cantidad: z.string().nullable(),
  precio_unitario: z.string().nullable(),
  subtotal: z.string().nullable(),
});
export const LecturaFacturaZ = z.object({
  es_factura: z.boolean(),
  cuit_emisor: z.string().nullable(),
  razon_social: z.string().nullable(),
  tipo: z.enum(["FA", "NC", "ND"]).nullable(),
  letra: z.string().nullable(),
  punto_venta: z.string().nullable(),
  numero: z.string().nullable(),
  fecha: z.string().nullable(),
  vencimiento: z.string().nullable(),
  cuit_receptor: z.string().nullable(),
  neto: z.string().nullable(),
  iva: z.string().nullable(),
  percepciones: z.string().nullable(),
  total: z.string().nullable(),
  moneda: z.string().nullable(),
  items: z.array(Item),
  dudas: z.array(z.string()),
});
