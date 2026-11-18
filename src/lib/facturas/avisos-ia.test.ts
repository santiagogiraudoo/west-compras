import { describe, expect, it } from "vitest";
import { avisosIA } from "./avisos-ia";

describe("avisosIA", () => {
  it("saca cada ⚠️ del plomero, sin el 'revisar:' y sin repetir", () => {
    expect(avisosIA("[plomero] Dicroicas 5W · ⚠️ falta unidad · ⚠️ revisar: el total no cierra · ⚠️ falta unidad · Nota: retira Ariel"))
      .toEqual(["falta unidad", "el total no cierra"]);
  });
  it("sin [plomero] o sin avisos, nada", () => {
    expect(avisosIA("12 lámparas, revisar contra el A CUENTA")).toEqual([]);
    expect(avisosIA("[plomero] Cemento · Nota: obra Salta")).toEqual([]);
    expect(avisosIA(null)).toEqual([]);
  });
});
