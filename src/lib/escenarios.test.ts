import { describe, expect, it } from "vitest";
import { resumirDeuda, sumarDias, type Abierto } from "./cuenta/calculos";
import { diasEntre, pendientesOP } from "./op/estados";
import { vencimientoOP } from "./op/pago";

/**
 * Escenarios de lo que pasa día a día y semana a semana: un mismo set de facturas y OP
 * visto en fechas distintas. Sirven para ver que "vencido", "esta semana" y los avisos
 * de Inicio cambian solos con el paso de los días, sin tocar ningún dato. Para verlo en
 * la pantalla, la barra de desarrollo mueve el "hoy" de la app (fecha simulada).
 */

const factura = (id: string, proveedor: string, vencimiento: string | null, deuda: string, en_op = "0"): Abierto => ({
  id, proveedor_codigo: proveedor, razon_social: proveedor, unidad_codigo: "UN-03", facturado_a: "Giraudo Hernando Esteban",
  tipo: "Factura A", numero: `0001-${id}`, fecha: "2026-11-01", vencimiento, total: deuda,
  libre: (Number(deuda) - Number(en_op)).toFixed(2), en_op, ops: en_op !== "0" ? "OP-2026-200" : null, deuda,
});

// La semana del lunes 16/11 al domingo 22/11 y la siguiente.
const FACTURAS: Abierto[] = [
  factura("1", "PR-A", "2026-11-13", "1000"),         // vencida el viernes anterior
  factura("2", "PR-A", "2026-11-18", "2000"),         // vence el miércoles
  factura("3", "PR-B", "2026-11-23", "3000", "3000"), // vence el lunes siguiente, ya en una OP
  factura("4", "PR-C", "2026-12-01", "4000"),         // vence en dos semanas
  factura("5", "PR-C", null, "500"),                  // sin vencimiento cargado
  factura("6", "PR-D", "2026-11-17", "0.40"),         // saldo de centavos: no cuenta como deuda
];

const dia = (desde: string, n: number) => sumarDias(desde, n);

describe("escenario diario: la deuda de una semana", () => {
  it("el lunes 16/11: una vencida y una que vence en la semana", () => {
    const t = resumirDeuda(FACTURAS, "2026-11-16");
    expect(t.vencido).toBe("1000.00");
    expect(t.semana).toBe("2000.00"); // la del 18; la del 23 cae fuera (la semana es 16 al 22)
    expect(t.deuda).toBe("10500.00"); // los centavos de PR-D no cuentan
    expect(t.en_op).toBe("3000.00");
  });

  it("el jueves 19/11: la del miércoles ya pasó a vencida", () => {
    const t = resumirDeuda(FACTURAS, "2026-11-19");
    expect(t.vencido).toBe("3000.00");
    expect(t.semana).toBe("3000.00");
  });

  it("esta semana son los 7 días desde hoy sin contar el séptimo: la del lunes siguiente entra el martes", () => {
    expect(resumirDeuda(FACTURAS, "2026-11-16").semana).toBe("2000.00");
    expect(resumirDeuda(FACTURAS, "2026-11-17").semana).toBe("5000.00"); // ahora entra la del 23
  });

  it("el día del vencimiento todavía no está vencida, al día siguiente sí", () => {
    expect(resumirDeuda(FACTURAS, "2026-11-18").vencido).toBe("1000.00");
    expect(resumirDeuda(FACTURAS, "2026-11-19").vencido).toBe("3000.00");
  });

  it("día por día durante dos semanas, la deuda total no cambia: solo se mueve entre vencido, semana y más adelante", () => {
    let vencidoAnterior = 0;
    for (let n = 0; n < 14; n++) {
      const hoy = dia("2026-11-16", n);
      const t = resumirDeuda(FACTURAS, hoy);
      expect(t.deuda).toBe("10500.00");
      // Lo vencido nunca baja solo con el paso de los días.
      expect(Number(t.vencido)).toBeGreaterThanOrEqual(vencidoAnterior);
      vencidoAnterior = Number(t.vencido);
      // Vencido + esta semana nunca supera la deuda (la sin fecha no entra en ninguno).
      expect(Number(t.vencido) + Number(t.semana)).toBeLessThanOrEqual(10000);
    }
    // El 2/12 está todo vencido salvo la que no tiene fecha.
    expect(resumirDeuda(FACTURAS, "2026-12-02").vencido).toBe("10000.00");
  });

  it("el próximo vencimiento de cada proveedor es el más cercano", () => {
    const t = resumirDeuda(FACTURAS, "2026-11-16");
    const a = t.porProveedor.find((p) => p.codigo === "PR-A");
    expect(a?.proximo_vencimiento).toBe("2026-11-13");
    expect(t.porProveedor[0].codigo).toBe("PR-C"); // la mayor deuda primero (PR-A y PR-B deben lo mismo)
  });
});

describe("escenario semanal: OP esperando y autorizadas", () => {
  const op = (numero: string, estado: "En armado" | "A aprobar" | "Observada" | "Autorizada", enviada: string | null, venc: string) => ({
    numero, estado, razon_social: "Sombra Hnos", armada_en: "2026-11-16", enviada_en: enviada,
    lineas: [{ decision: estado === "Observada" ? ("Observada" as const) : null, aprobador: "Adriano Izquierdo", usuario: estado === "Observada" ? "Adriano Izquierdo" : null,
      motivo: estado === "Observada" ? "falta el remito" : null, importe: "1000", vencimiento: venc }],
  });
  const OPS = [
    op("OP-1", "En armado", null, "2026-11-20"),
    op("OP-2", "A aprobar", "2026-11-16", "2026-11-25"),
    op("OP-3", "Observada", "2026-11-16", "2026-11-25"),
    op("OP-4", "Autorizada", "2026-11-16", "2026-11-19"),
  ];

  it("el lunes, recién mandada: 'desde hoy'; el viernes, 'hace 4 días'", () => {
    const lunes = pendientesOP(OPS, "2026-11-16").find((p) => p.detalle.startsWith("OP-2"));
    const viernes = pendientesOP(OPS, "2026-11-20").find((p) => p.detalle.startsWith("OP-2"));
    expect(lunes?.detalle).toMatch(/desde hoy/);
    expect(viernes?.detalle).toMatch(/hace 4 días/);
  });

  it("la armada sin mandar avisa cuántos días lleva", () => {
    expect(pendientesOP(OPS, "2026-11-16").find((p) => p.tipo === "OP en armado")?.detalle).toMatch(/hoy/);
    expect(pendientesOP(OPS, "2026-11-18").find((p) => p.tipo === "OP en armado")?.detalle).toMatch(/hace 2 días/);
  });

  it("cada estado manda a su pantalla", () => {
    const p = pendientesOP(OPS, "2026-11-18");
    expect(p.find((x) => x.tipo === "OP en armado")?.href).toBe("/op");
    expect(p.find((x) => x.tipo === "OP esperando aprobación")?.href).toBe("/op?paso=aprobar");
    expect(p.find((x) => x.tipo === "OP observada")?.href).toBe("/op?paso=aprobar");
    expect(p.find((x) => x.tipo === "OP autorizada para pagar")?.href).toBe("/op?paso=pagar");
  });

  it("la cola de pagos ordena por el vencimiento más cercano de cada OP", () => {
    expect(vencimientoOP([{ importe: "1", vencimiento: "2026-11-25" }, { importe: "1", vencimiento: "2026-11-19" }])).toBe("2026-11-19");
    // Una línea en cero (anulada o compensada) no cuenta para el vencimiento.
    expect(vencimientoOP([{ importe: "0", vencimiento: "2026-11-10" }, { importe: "1", vencimiento: "2026-11-25" }])).toBe("2026-11-25");
  });

  it("los días se cuentan por fecha, sin importar la hora ni el cambio de mes", () => {
    expect(diasEntre("2026-11-30", "2026-12-01")).toBe(1);
    expect(diasEntre("2026-11-16T23:59:00", "2026-11-17")).toBe(1);
    expect(diasEntre("2026-12-28", "2027-01-04")).toBe(7);
  });
});
