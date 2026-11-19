# 05 · Retenciones de Ganancias e IIBB

Fuente: doc de Candela "Retenciones de Ganancias e IIBB – Procedimiento para automatizar"
(claude.ai/artifact/JSfAoQnq4JvTyJictdcHyh), 18/11/2026.

## Cómo es hoy
- Agente de retención: **Hernando Esteban Giraudo**.
- Cande calcula a mano en cada pago y carga los montos en los campos de la tarea de Pagos de ClickUp.
- **Ganancias (RG 830):** calculadora de ARCA. Entra: inscripto o no, persona humana o
  jurídica, neto sin IVA, concepto, y lo pagado y retenido **al mismo CUIT en el mes**
  (es acumulativo). Ej.: enajenación de bienes, 2% sobre lo que pasa el mínimo no sujeto.
- **IIBB (ATM Mendoza):** ver si al proveedor se le retiene y a qué alícuota. La habitual
  es 3%; la referencia es el Excel de certificados IIBB 2026. Cruz del Sur no se retiene.
  Riesgo fiscal: doble. Cambia por actividad, local o Convenio Multilateral, y certificados.

## Lo que ya hay en la base
`cc.ordenes_pago` tiene `ret_ganancias`, `ret_iibb`, `ret_iva`, `total_retenciones` y
`neto_transferir`. Al 18/11: 142 OP, 40 con Ganancias ($1.383.694,75) y 46 con IIBB
($2.242.059,95). **Esa historia es el test**: el cálculo nuevo tiene que dar lo mismo que
calculó Cande en esas OP. Si no da, es una regla que no entendimos.

## Diseño propuesto (regla pareja, la app sugiere y Cande confirma)
1. **Dos tablas editables en `app`** (las carga y corrige Cande, sin código):
   - `app.ret_ganancias_conceptos`: concepto, alícuota inscripto, alícuota no inscripto,
     mínimo no sujeto mensual, mínimo de retención, si usa escala.
   - `app.ret_iibb_proveedores`: proveedor, alícuota (por defecto 3%), no se retiene (sí/no
     y por qué, ej. Cruz del Sur), riesgo fiscal, certificado y vencimiento.
   - En la ficha del proveedor: concepto de Ganancias por defecto e inscripto sí/no.
2. **Cálculo puro en `src/lib/retenciones/`** (decimal.js, con tests):
   - Ganancias del mes por CUIT = (netos pagados en el mes, incluida esta OP − mínimo no
     sujeto) × alícuota − lo ya retenido en el mes. Se deriva de `cc.ordenes_pago`, no se guarda aparte.
   - IIBB = neto × alícuota del proveedor (× riesgo fiscal); 0 si no se retiene.
3. **En la pantalla de la OP**: aparece la retención sugerida con el detalle del cálculo
   (base, acumulado del mes, mínimo, alícuota). Cande la confirma o la corrige con motivo;
   lo confirmado se graba en la OP por la función de la base (nunca UPDATE directo).
4. **Después** (fase 2): certificado de retención en PDF, archivo para SICORE/SIRE (ARCA) y
   para SAREPE (ATM), y consulta de padrones (constancia ARCA, riesgo fiscal ATM).

## Lo que falta de Cande / Adriano
1. El **Excel de certificados IIBB 2026** (alícuotas por proveedor).
2. La lista de proveedores con alícuota especial, exentos o con certificado de no retención.
3. Riesgo fiscal: ¿"doble" sobre la alícuota del proveedor, o la alícuota fija de alto riesgo
   que fija ATM? (la RG ATM de 2025 habla de 4%; confirmar).
4. Conceptos de Ganancias que usa de verdad (bienes, servicios, locaciones, honorarios…) y a qué proveedores.
5. ¿Se retiene solo cuando paga Hernando Esteban Giraudo, o también en pagos de otros
   titulares (Yrigoyen Developer, Doblege)?
6. Cómo emite y presenta hoy los certificados y las DDJJ (SICORE/SIRE, SAREPE), y cada cuánto.
7. ¿Se retiene sobre el neto de la factura o sobre lo que se paga en esa OP (pagos parciales)?
