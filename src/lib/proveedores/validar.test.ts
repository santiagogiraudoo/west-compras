import { describe, expect, it } from "vitest";
import { normalizarCbuAlias, normalizarCuit, normalizarTelefono, proximoCodigo, validarAlta, type AltaProveedor } from "./validar";

// CUIT del titular Giraudo Hernando Esteban (cc.titulares), verificador válido.
const CUIT_OK = "20-25766140-8";
// CBU de ejemplo con los dos verificadores válidos.
const CBU_OK = "2850590940090418135201";

const alta: AltaProveedor = {
  razonSocial: "Corralón Ejemplo SRL", cuit: CUIT_OK, condicionIva: "Responsable Inscripto",
  cbuAlias: "corralon.ejemplo", telefono: "260 4123456", rubro: "Corralón", condicionPago: "30 días f.f.",
  plazoDias: "30", medioPago: "Transferencia", email: "", contacto: "",
};

describe("normalizarCuit", () => {
  it("acepta con o sin guiones y devuelve con guiones", () => {
    expect(normalizarCuit("20257661408")).toBe(CUIT_OK);
    expect(normalizarCuit(CUIT_OK)).toBe(CUIT_OK);
  });
  it("rechaza verificador malo o largo malo", () => {
    expect(normalizarCuit("20-25766140-7")).toBeNull();
    expect(normalizarCuit("2025766140")).toBeNull();
  });
});

describe("normalizarCbuAlias", () => {
  it("acepta CBU válido y alias", () => {
    expect(normalizarCbuAlias(CBU_OK)).toBe(CBU_OK);
    expect(normalizarCbuAlias("corralon.ejemplo")).toBe("CORRALON.EJEMPLO");
  });
  it("rechaza CBU con verificador malo o alias corto", () => {
    expect(normalizarCbuAlias("2850590940090418135202")).toBeNull();
    expect(normalizarCbuAlias("abc")).toBeNull();
  });
});

describe("normalizarTelefono", () => {
  it("deja solo dígitos y pide al menos 10", () => {
    expect(normalizarTelefono("+54 9 260 412-3456")).toBe("5492604123456");
    expect(normalizarTelefono("4123456")).toBeNull();
  });
});

describe("validarAlta", () => {
  it("un alta completa no tiene errores", () => {
    const { errores, limpio } = validarAlta(alta);
    expect(errores).toEqual({});
    expect(limpio.telefono).toBe("2604123456");
  });
  it("marca cada dato obligatorio que falta", () => {
    const { errores } = validarAlta({ ...alta, cuit: "", cbuAlias: "", telefono: "", rubro: "", condicionPago: "" });
    expect(Object.keys(errores).sort()).toEqual(["cbuAlias", "condicionPago", "cuit", "rubro", "telefono"]);
  });
  it("en negro y en efectivo no pide CBU", () => {
    const { errores } = validarAlta({ ...alta, condicionIva: "En negro (sin factura)", medioPago: "Efectivo", cbuAlias: "" });
    expect(errores.cbuAlias).toBeUndefined();
  });
});

describe("proximoCodigo", () => {
  it("toma el mayor PR y suma uno", () => {
    expect(proximoCodigo(["PR-001", "PR-059", "CT-003"])).toBe("PR-060");
  });
});
