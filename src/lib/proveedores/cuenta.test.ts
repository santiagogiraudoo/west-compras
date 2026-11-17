import { describe, expect, it } from "vitest";
import { armarTextoCuenta, bancoDelCbu, separarCuenta } from "./cuenta";

// Textos tal cual están en cc.proveedores.cbu_alias (17/11).
describe("separarCuenta con los textos reales", () => {
  const casos: [string, string, ReturnType<typeof separarCuenta>][] = [
    ["PR-009", "CBU 0170279020000001215256 · BBVA Cta. Cte. $ 279-12152/5 · titular Pelloni Juan Miguel (CUIL 20-32502058-0) · constancia 09/12/2025",
      { cbu: "0170279020000001215256", alias: null, banco: "BBVA", titular: "Pelloni Juan Miguel" }],
    ["PR-012", "CBU 0150807702000105477080 · alias ROSA.TAPA.TEATRO (ICBC cta. cte. 0807/02105477/08)",
      { cbu: "0150807702000105477080", alias: "ROSA.TAPA.TEATRO", banco: "ICBC", titular: null }],
    ["PR-020", "Alias ferrimaquinas.mp · CVU 0000003100036980484437 · Mercado Pago · titular Alfonso Martin Ramos (CUIT 20-28601049-1) · mail 05/11/2026",
      { cbu: "0000003100036980484437", alias: "FERRIMAQUINAS.MP", banco: "Mercado Pago", titular: "Alfonso Martin Ramos" }],
    ["PR-022", "0170279040000000004574", { cbu: "0170279040000000004574", alias: null, banco: "BBVA", titular: null }],
    ["PR-026", "Alias cruzdel.sur · mail 05/11/2026 (sin CBU ni titular: verificar el nombre al transferir)",
      { cbu: null, alias: "CRUZDEL.SUR", banco: null, titular: null }],
    ["PR-034", "CBU 0110485520048503760119 · alias FerreyraJL (BBVA CC $ 33004850376011, titular Valeria Belen Ferreyra, CUIL 27-28645875-6: no es el CUIT del proveedor)",
      { cbu: "0110485520048503760119", alias: "FERREYRAJL", banco: "Banco Nación", titular: "Valeria Belen Ferreyra" }],
    ["PR-037", "0110266830026601419033 (alias miguelpremo, Bco. Nacion; titulares Martin Miguel Oscar / Ortiz Gladys Esther)",
      { cbu: "0110266830026601419033", alias: "MIGUELPREMO", banco: "Banco Nación", titular: "Martin Miguel Oscar / Ortiz Gladys Esther" }],
    ["PR-039", "Credicoop CBU 1910043855004301128614", { cbu: "1910043855004301128614", alias: null, banco: "Credicoop", titular: null }],
    ["PR-045", "Alias: suriego", { cbu: null, alias: "SURIEGO", banco: null, titular: null }],
    ["PR-050", "0070222720000001449217 · alias ULLER.FRIO.SOLO (Galicia suc. San Rafael, cta cte 1449-2 222-1)",
      { cbu: "0070222720000001449217", alias: "ULLER.FRIO.SOLO", banco: "Galicia", titular: null }],
  ];
  it.each(casos)("%s", (_, texto, esperado) => {
    expect(separarCuenta(texto)).toEqual(esperado);
  });

  it("sin texto no inventa nada", () => {
    expect(separarCuenta(null)).toEqual({ cbu: null, alias: null, banco: null, titular: null });
  });
});

describe("bancoDelCbu", () => {
  it("lee la entidad del CBU y el PSP del CVU", () => {
    expect(bancoDelCbu("0720262188000035997322")).toBe("Santander");
    expect(bancoDelCbu("0000003100006479496485")).toBe("Mercado Pago");
    expect(bancoDelCbu("9990000000000000000000")).toBeNull();
  });
});

describe("armarTextoCuenta", () => {
  it("vuelve a armar el texto para quien lee cbu_alias, y se puede volver a separar", () => {
    const c = { cbu: "0000003100036980484437", alias: "FERRIMAQUINAS.MP", banco: "Mercado Pago", titular: "Alfonso Martin Ramos" };
    const texto = armarTextoCuenta(c);
    expect(texto).toBe("CVU 0000003100036980484437 · alias FERRIMAQUINAS.MP · Mercado Pago · titular Alfonso Martin Ramos");
    expect(separarCuenta(texto)).toEqual(c);
  });
  it("vacío da null", () => {
    expect(armarTextoCuenta({ cbu: null, alias: null, banco: null, titular: null })).toBeNull();
  });
});
