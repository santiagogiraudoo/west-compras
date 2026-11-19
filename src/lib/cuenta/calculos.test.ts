import { describe, expect, it } from "vitest";
import { armarExtracto, importeElegido, porVencerSinOP, resumirDeuda, sumarDias, validarSeleccionOP, type Abierto } from "./calculos";

const ab = (o: Partial<Abierto>): Abierto => ({
  id: "1", proveedor_codigo: "PR-1", razon_social: "Corralón", unidad_codigo: "UN-01", facturado_a: "Doblege",
  tipo: "Factura A", numero: "0001-1", fecha: "2026-11-01", vencimiento: null, total: "100", libre: "100",
  en_op: "0", ops: null, deuda: "100", ...o,
});

describe("sumarDias", () => {
  it("cruza fin de mes sin correrse por zona horaria", () => {
    expect(sumarDias("2026-11-28", 7)).toBe("2026-12-05");
  });
});

describe("resumirDeuda", () => {
  const hoy = "2026-11-17";

  it("separa vencido, esta semana y lo que está en OP prevista", () => {
    const t = resumirDeuda([
      ab({ id: "1", vencimiento: "2026-11-10", deuda: "100", libre: "100" }),
      ab({ id: "2", vencimiento: "2026-11-17", deuda: "50.25", libre: "0", en_op: "50.25" }),
      ab({ id: "3", vencimiento: "2026-11-24", deuda: "30", libre: "30" }), // día 7: ya no es esta semana
      ab({ id: "4", proveedor_codigo: "PR-2", razon_social: "Ferretería", vencimiento: "2026-11-23", deuda: "10" }),
    ], hoy);
    expect(t.deuda).toBe("190.25");
    expect(t.vencido).toBe("100.00");
    expect(t.semana).toBe("60.25");
    expect(t.en_op).toBe("50.25");
    expect(t.porProveedor.map((p) => p.codigo)).toEqual(["PR-1", "PR-2"]);
    expect(t.porProveedor[0].proximo_vencimiento).toBe("2026-11-10");
  });

  it("una nota de crédito sin aplicar no resta deuda: es saldo a favor y se ve en la cuenta", () => {
    const t = resumirDeuda([ab({ deuda: "100" }), ab({ id: "2", tipo: "Nota de Credito A", deuda: "-40" })], hoy);
    expect(t.deuda).toBe("100.00");
  });

  it("ignora centavos sueltos, como la vista de la base", () => {
    expect(resumirDeuda([ab({ deuda: "0.40" })], hoy).porProveedor).toEqual([]);
  });
});

describe("armarExtracto", () => {
  it("factura al haber, nota de crédito y pago al debe, con saldo corrido", () => {
    const e = armarExtracto([
      { fecha: "2026-11-05", concepto: "Pago OP-2026-001", unidad: null, importe: "-60", clase: "pago" },
      { fecha: "2026-11-01", concepto: "Factura A 1", unidad: "UN-01", importe: "100", clase: "comprobante" },
      { fecha: "2026-11-05", concepto: "Nota de Credito A 2", unidad: "UN-01", importe: "-10", clase: "comprobante" },
    ]);
    expect(e.lineas.map((l) => [l.concepto, l.debe, l.haber, l.saldo])).toEqual([
      ["Factura A 1", "0.00", "100.00", "100.00"],
      ["Nota de Credito A 2", "10.00", "0.00", "90.00"],
      ["Pago OP-2026-001", "60.00", "0.00", "30.00"],
    ]);
    expect(e).toMatchObject({ debe: "70.00", haber: "100.00", saldo: "30.00" });
  });

  it("no pierde centavos al sumar muchos montos", () => {
    const movs = Array.from({ length: 10 }, () => ({ fecha: "2026-11-01", concepto: "x", unidad: null, importe: "0.1", clase: "comprobante" as const }));
    expect(armarExtracto(movs).saldo).toBe("1.00");
  });
});

describe("validarSeleccionOP", () => {
  it("suma lo libre y devuelve el titular", () => {
    const r = validarSeleccionOP([ab({ libre: "100.10" }), ab({ libre: "-20.05", numero: "NC" })]);
    expect(r).toEqual({ errores: [], total: "80.05", titular: "Doblege", compensacion: false });
  });

  it("no cruza titulares", () => {
    const r = validarSeleccionOP([ab({}), ab({ facturado_a: "Yrigoyen Developer" })]);
    expect(r.errores).toContain("Una OP es de un solo titular: no se cruzan cuentas");
  });

  it("no repite facturas que ya están en otra OP ni deja total negativo", () => {
    const r = validarSeleccionOP([ab({ libre: "0", numero: "0001-9" }), ab({ libre: "-5" })]);
    expect(r.errores).toEqual(["Ya están en otra OP: 0001-9", "La nota de crédito supera las facturas: aplicá solo una parte"]);
  });

  it("vacía no se puede", () => {
    expect(validarSeleccionOP([]).errores).toEqual(["Elegí al menos una factura"]);
  });
});

describe("porVencerSinOP", () => {
  const hoy = "2026-11-18";
  it("con plazo, sin OP, que vence en 7 días o ya venció; la que vence primero arriba", () => {
    const r = porVencerSinOP([
      ab({ id: "1", proveedor_codigo: "PR-1", vencimiento: "2026-11-22", libre: "100" }),
      ab({ id: "2", proveedor_codigo: "PR-1", vencimiento: "2026-11-20", libre: "50" }),
      ab({ id: "3", proveedor_codigo: "PR-2", razon_social: "Pinturería", vencimiento: "2026-11-15", libre: "30" }),
      ab({ id: "4", proveedor_codigo: "PR-3", vencimiento: "2026-11-25", libre: "10" }), // vence el día 7: afuera
      ab({ id: "5", proveedor_codigo: "PR-4", vencimiento: "2026-11-20", libre: "0", en_op: "80" }), // ya en OP
      ab({ id: "6", proveedor_codigo: "PR-5", fecha: "2026-11-17", vencimiento: "2026-11-17" }), // contado
      ab({ id: "7", proveedor_codigo: "PR-6", vencimiento: null }), // sin vencimiento
    ], hoy);
    expect(r).toEqual([
      { proveedor_codigo: "PR-2", razon_social: "Pinturería", facturas: 1, libre: "30.00", vence: "2026-11-15" },
      { proveedor_codigo: "PR-1", razon_social: "Corralón", facturas: 2, libre: "150.00", vence: "2026-11-20" },
    ]);
  });
});

describe("nota de crédito que cancela una factura entera o una parte (decisión 19/11)", () => {
  it("NC por todo: la OP queda en $0 y es una compensación", () => {
    const r = validarSeleccionOP([ab({ libre: "1000" }), ab({ libre: "-1000", numero: "NC" })]);
    expect(r).toMatchObject({ errores: [], total: "0.00", compensacion: true });
  });
  it("NC por una parte: se paga la diferencia", () => {
    const r = validarSeleccionOP([ab({ libre: "1000" }), ab({ libre: "-300", numero: "NC" })]);
    expect(r).toMatchObject({ errores: [], total: "700.00", compensacion: false });
  });
  it("sin NC, $0 no es una OP", () => {
    expect(validarSeleccionOP([ab({ libre: "0" })]).errores).toContain("El total de la OP tiene que ser positivo");
  });
});

describe("importeElegido: lo que se escribe para cada factura o NC", () => {
  it("vacío es todo lo libre", () => {
    expect(importeElegido("1000", "F1")).toEqual({ ok: true, importe: "1000.00" });
    expect(importeElegido("-300", "NC1", "  ")).toEqual({ ok: true, importe: "-300.00" });
  });
  it("en una NC lo escrito resta, aunque se escriba en positivo", () => {
    expect(importeElegido("-1000", "NC1", "250")).toEqual({ ok: true, importe: "-250.00" });
    expect(importeElegido("-1000", "NC1", "-250")).toEqual({ ok: true, importe: "-250.00" });
  });
  it("nunca más que lo libre ni menos que el redondeo", () => {
    expect(importeElegido("1000", "F1", "1.500")).toEqual({ ok: false, mensaje: "A F1 le quedan libres $1.000: no se puede pagar más" });
    expect(importeElegido("-1000", "NC1", "1500")).toEqual({ ok: false, mensaje: "A NC1 le quedan libres $1.000: no se puede aplicar más" });
    expect(importeElegido("1000", "F1", "0,40")).toMatchObject({ ok: false });
    expect(importeElegido("1000", "F1", "1,234.56")).toMatchObject({ ok: false });
  });
});
