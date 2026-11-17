import { describe, expect, it } from "vitest";
import { normalizarAlias, normalizarCbu, normalizarCuit, normalizarTelefono, proximoCodigo, validarAlta, type AltaProveedor } from "./validar";

// CUIT del titular Giraudo Hernando Esteban (cc.titulares), verificador válido.
const CUIT_OK = "20-25766140-8";
// CBU de ejemplo con los dos verificadores válidos.
const CBU_OK = "2850590940090418135201";

const alta: AltaProveedor = {
  razonSocial: "Corralón Ejemplo SRL", cuit: CUIT_OK, condicionIva: "Responsable Inscripto",
  cbu: "", alias: "corralon.ejemplo", banco: "", cuentaTitular: "Corralón Ejemplo SRL", telefono: "260 4123456", rubro: "Corralón", condicionPago: "30 días f.f.",
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

describe("normalizarCbu y normalizarAlias", () => {
  it("acepta CBU y CVU válidos (de la base) y alias", () => {
    expect(normalizarCbu(CBU_OK)).toBe(CBU_OK);
    expect(normalizarCbu("0170279020000001215256")).toBe("0170279020000001215256");
    expect(normalizarCbu("0000003100036980484437")).toBe("0000003100036980484437");
    expect(normalizarAlias("corralon.ejemplo")).toBe("CORRALON.EJEMPLO");
  });
  it("rechaza CBU con verificador malo, texto mezclado o alias corto", () => {
    expect(normalizarCbu("2850590940090418135202")).toBeNull();
    expect(normalizarCbu("CBU 2850590940090418135201 · BBVA")).toBeNull();
    expect(normalizarAlias("abc")).toBeNull();
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
    const { errores } = validarAlta({ ...alta, cuit: "", alias: "", telefono: "", rubro: "", condicionPago: "" });
    expect(Object.keys(errores).sort()).toEqual(["cbu", "condicionPago", "cuit", "rubro", "telefono"]);
  });
  it("en negro y en efectivo no pide CBU", () => {
    const { errores } = validarAlta({ ...alta, condicionIva: "En negro (sin factura)", medioPago: "Efectivo", alias: "" });
    expect(errores.cbu).toBeUndefined();
  });
  it("con cuenta pide el titular, y el banco sale del CBU", () => {
    const sinTitular = validarAlta({ ...alta, cuentaTitular: "" });
    expect(sinTitular.errores.cuentaTitular).toBeDefined();
    const conCbu = validarAlta({ ...alta, cbu: "0170279020000001215256", alias: "" });
    expect(conCbu.errores).toEqual({});
    expect(conCbu.limpio.banco).toBe("BBVA");
  });
  it("el texto viejo de cbu_alias en el campo CBU se rechaza con un motivo claro", () => {
    const { errores } = validarAlta({ ...alta, cbu: "CBU 0170279020000001215256 · BBVA" });
    expect(errores.cbu).toMatch(/inválido/);
  });
});

describe("proximoCodigo", () => {
  it("toma el mayor PR y suma uno", () => {
    expect(proximoCodigo(["PR-001", "PR-059", "CT-003"])).toBe("PR-060");
  });
});
