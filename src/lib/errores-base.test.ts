import { describe, expect, it } from "vitest";
import { mensajeBase } from "./errores-base";

describe("mensajeBase", () => {
  it("traduce los frenos conocidos", () => {
    expect(mensajeBase('duplicate key value violates unique constraint "comprobante_unico_clave"')).toMatch(/ya está cargado/);
    expect(mensajeBase('new row for relation "comprobantes" violates check constraint "vencimiento_despues_de_fecha"')).toMatch(/vencimiento/);
  });
  it("deja pasar los mensajes que ya vienen en español", () => {
    expect(mensajeBase("La factura X es de PR-1, no de PR-2")).toBe("La factura X es de PR-1, no de PR-2");
  });
});
