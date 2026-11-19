import { describe, expect, it } from "vitest";
import { facturaDelRemito, numerosEnTexto, remitosDeLaFactura, subconjunto, type FacturaCruce, type RemitoCruce } from "./cruce";

const f = (o: Partial<FacturaCruce> = {}): FacturaCruce => ({ id: "1", numero: "00003-00008897", fecha: "2026-11-10", total: "121000", descripcion: null, ...o });
const r = (o: Partial<RemitoCruce> = {}): RemitoCruce => ({ id: "r1", numero: "0001-00011778", fecha: "2026-11-08", importe: null, facturas_citadas: [], ...o });

describe("numerosEnTexto", () => {
  it("encuentra los números con guion y los pegados de 13 dígitos", () => {
    expect(numerosEnTexto("Remito RE 0001-00011778 · retira Juan")).toEqual(["0001-00011778"]);
    expect(numerosEnTexto("X0000100013385")).toEqual(["00001-00013385"]);
    expect(numerosEnTexto(null)).toEqual([]);
  });
});

describe("facturaDelRemito", () => {
  it("1. el remito cita la factura (con 4 o 5 dígitos de punto de venta)", () => {
    const x = facturaDelRemito(r({ facturas_citadas: ["0003-00008897"] }), [f(), f({ id: "2", numero: "00003-00008898" })]);
    expect(x?.factura.id).toBe("1");
    expect(x?.por).toBe("el remito cita la factura");
  });
  it("2. la factura cita el remito", () => {
    const x = facturaDelRemito(r(), [f({ descripcion: "[plomero] arena · Remito 00001-00011778" }), f({ id: "2" })]);
    expect(x?.por).toBe("la factura cita el remito");
    expect(x?.factura.id).toBe("1");
  });
  it("3. mismo importe y fecha cercana, solo si hay un candidato", () => {
    expect(facturaDelRemito(r({ importe: "121.000,00" }), [f(), f({ id: "2", total: "5000" })])?.por).toBe("mismo importe y fecha");
    expect(facturaDelRemito(r({ importe: "121000" }), [f(), f({ id: "2" })])).toBeNull(); // dos iguales: no se adivina
    expect(facturaDelRemito(r({ importe: "121000", fecha: "2026-09-01" }), [f()])).toBeNull(); // lejos
    expect(facturaDelRemito(r({ importe: "120998" }), [f()])).toBeNull(); // $2 de diferencia: no cierra
  });
});

describe("remitosDeLaFactura", () => {
  it("factura de remitos: la suma de varios remitos abiertos", () => {
    const rs = [r({ id: "a", importe: "50000", fecha: "2026-10-20" }), r({ id: "b", importe: "71000", fecha: "2026-10-25" }), r({ id: "c", importe: "9999", fecha: "2026-11-01" })];
    const x = remitosDeLaFactura(f(), rs);
    expect(x?.por).toBe("suma de remitos");
    expect(x?.remitos.map((y) => y.id).sort()).toEqual(["a", "b"]);
  });
  it("los remitos posteriores a la factura no suman", () => {
    const rs = [r({ id: "a", importe: "50000", fecha: "2026-11-20" }), r({ id: "b", importe: "71000", fecha: "2026-11-21" })];
    expect(remitosDeLaFactura(f(), rs)).toBeNull();
  });
  it("un remito del mismo importe y fecha", () => {
    expect(remitosDeLaFactura(f(), [r({ id: "a", importe: "121000" })])?.remitos.map((y) => y.id)).toEqual(["a"]);
  });
});

describe("subconjunto", () => {
  it("todos, todos menos uno o una combinación, en centavos exactos", () => {
    const rs = ["100.01", "200.02", "300.03", "400.04"].map((v, i) => r({ id: String(i + 1), importe: v }));
    expect(subconjunto(rs, "1000.10")?.length).toBe(4); // todos
    expect(subconjunto(rs, "900.09")?.map((x) => x.id)).toEqual(["2", "3", "4"]); // todos menos uno
    expect(subconjunto(rs, "500.05")?.map((x) => x.id)).toEqual(["1", "4"]); // combinación
    expect(subconjunto(rs, "0.01")).toBeNull();
    expect(subconjunto(rs, "500.04")).toBeNull(); // un centavo de diferencia no es la suma
  });
});
