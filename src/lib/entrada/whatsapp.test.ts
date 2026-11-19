import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { acuse, firmaValida, leerWebhook } from "./whatsapp";

// Forma real de un aviso de la Cloud API de Meta (recortado).
const aviso = {
  object: "whatsapp_business_account",
  entry: [{
    id: "1", changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp", metadata: { phone_number_id: "999" },
        contacts: [{ profile: { name: "Juan Spano" }, wa_id: "5493511234567" }],
        messages: [
          { from: "5493511234567", id: "wamid.A", type: "image", image: { id: "M1", mime_type: "image/jpeg", caption: "remito obra West Club" } },
          { from: "5493511234567", id: "wamid.B", type: "document", document: { id: "M2", mime_type: "application/pdf", filename: "FA 0003-8897.pdf" } },
          { from: "5493511234567", id: "wamid.C", type: "text", text: { body: "hola" } },
        ],
      },
    }],
  }],
};

describe("leerWebhook", () => {
  it("saca foto, PDF y texto con quién lo mandó", () => {
    const m = leerWebhook(aviso);
    expect(m).toHaveLength(3);
    expect(m[0]).toEqual({ id: "wamid.A", de: "5493511234567", nombre: "Juan Spano", media: { id: "M1", mime: "image/jpeg", nombreArchivo: null }, texto: "remito obra West Club" });
    expect(m[1].media).toEqual({ id: "M2", mime: "application/pdf", nombreArchivo: "FA 0003-8897.pdf" });
    expect(m[2]).toMatchObject({ media: null, texto: "hola" });
  });
  it("ignora avisos de estado y basura sin romperse", () => {
    expect(leerWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] })).toEqual([]);
    expect(leerWebhook(null)).toEqual([]);
    expect(leerWebhook({ entry: "x" })).toEqual([]);
  });
});

describe("firmaValida", () => {
  const cuerpo = JSON.stringify(aviso);
  const firma = "sha256=" + createHmac("sha256", "secreto").update(cuerpo).digest("hex");
  it("acepta la firma de Meta y rechaza todo lo demás", () => {
    expect(firmaValida(cuerpo, firma, "secreto")).toBe(true);
    expect(firmaValida(cuerpo + " ", firma, "secreto")).toBe(false);
    expect(firmaValida(cuerpo, firma, "otro")).toBe(false);
    expect(firmaValida(cuerpo, null, "secreto")).toBe(false);
    expect(firmaValida(cuerpo, "sha256=abc", "secreto")).toBe(false);
    expect(firmaValida(cuerpo, firma, "")).toBe(false);
  });
});

describe("acuse", () => {
  it("contesta en una línea lo que pasó", () => {
    expect(acuse({ tipo: "cargar_factura", proveedor: "PR-1", titular: null, numero: "00003-00008897", avisos: [] })).toBe("Recibida la factura 00003-00008897. Queda para aprobar.");
    expect(acuse({ tipo: "cargar_remito", proveedor: "PR-1", avisos: ["Remito sin firma de quien recibió"] }, { numero: "0001-1" })).toMatch(/remito 0001-1.*sin firma/);
    expect(acuse({ tipo: "descartar", motivo: "no es una factura" })).toMatch(/Mandá la factura o el remito/);
  });
});
