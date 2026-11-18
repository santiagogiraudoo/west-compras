import { describe, expect, it } from "vitest";
import { terminos } from "./terminos";

describe("terminos", () => {
  it("arma el ILIKE sin dejar pasar comodines y saca los dígitos", () => {
    expect(terminos(" 20-32502058-0 ")).toEqual({ texto: "%20-32502058-0%", digitos: "20325020580" });
    expect(terminos("50%_off")).toEqual({ texto: "%50\\%\\_off%", digitos: "50" });
  });
});
