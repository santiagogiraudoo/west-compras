import { describe, expect, it } from "vitest";
import { cierra, hayLibre, leerMonto, leerMontoONull } from "./montos";

describe("leerMonto: el mismo texto vale lo mismo en toda la app", () => {
  it.each([
    ["1.234.567,89", "1234567.89"],
    ["1234,5", "1234.50"],
    ["$ 1.500", "1500.00"],
    ["1.500", "1500.00"], // un tope de "1.500" son mil quinientos, no uno y medio
    ["1.000.000", "1000000.00"],
    ["12.500", "12500.00"],
    ["1842.76", "1842.76"], // NumericInput y la IA
    ["1.5", "1.50"],
    ["0", "0.00"],
    ["-4.000,00", "-4000.00"], // nota de crédito
    ["  15000  ", "15000.00"],
  ])("%s → %s", (texto, esperado) => {
    expect(leerMonto(texto)).toBe(esperado);
  });

  it.each([
    "1,234.56", // EE. UU.: antes daba $1,23 y pasaba como pago parcial
    "1.234.5",
    "1,2,3",
    "12,345", // ¿doce mil o doce con 345? no se adivina
    "abc",
    "",
    "   ",
    "1e5",
    "NaN",
    "Infinity",
    "--5",
  ])("rechaza %j", (texto) => {
    expect(() => leerMonto(texto)).toThrow();
  });

  it("más decimales cuando se piden (precio unitario)", () => {
    expect(leerMonto("12,345", 3)).toBe("12.345");
    expect(leerMonto("0,1234", 4)).toBe("0.1234");
  });

  it("leerMontoONull no tira", () => {
    expect(leerMontoONull("1,234.56")).toBeNull();
    expect(leerMontoONull("1.234,56")).toBe("1234.56");
  });
});

describe("cierra: tolerancia cero (menos de $1), igual que la base", () => {
  it("centavos cierran, un peso no", () => {
    expect(cierra("1000", "1000.99")).toBe(true);
    expect(cierra("1000", "999.01")).toBe(true);
    expect(cierra("1000", "1001")).toBe(false);
    expect(cierra("1000", "999")).toBe(false);
  });
});

describe("hayLibre", () => {
  it("menos de 50 centavos es redondeo", () => {
    expect(hayLibre("0.5")).toBe(false);
    expect(hayLibre("0.51")).toBe(true);
    expect(hayLibre("-3")).toBe(false);
  });
});
