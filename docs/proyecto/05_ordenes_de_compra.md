# Órdenes de compra · borrador para pensar (18/11/2026)

Punto de partida (Adriano, 17/11): **la orden de compra sigue en ClickUp** (presupuestos, plazos, entrega) y entra a la app recién con el remito o la confirmación de compra. Fase 4 está lista cuando "una factura que cruza con su compra y su remito pasa sin que nadie la toque".

## Lo que hay hoy en la base

- `cc.remitos` (477 en production): cada remito apunta a **una factura** (`comprobante_id`), con importe, estado (ok / falta / anulado), quién retiró y quién autorizó.
- No hay compra en ningún lado de la base: el cruce de hoy es factura ↔ remito (sql/011, tolerancia cero).
- El tope se evalúa **en la OP**, sobre el importe de la factura (`src/lib/op/topes.ts`).

## Propuesta

1. **La compra entra como un registro mínimo, no como una OC nueva.** Tabla `cc.compras`, escrita por el plomero desde ClickUp con una función `cc.cargar_compras` (igual que facturas y pagos: la base frena lo repetido). Campos: tarea de ClickUp (link), proveedor, unidad, categoría, importe acordado, fecha, quién la pidió, quién la autorizó. Nada de presupuestos ni plazos: eso queda en ClickUp.
2. **La cadena se arma por el remito.** `cc.remitos.compra_id`: una compra puede tener varios remitos (entregas parciales) y cada remito su factura. La relación factura ↔ compra no se guarda: se deriva por los remitos.
3. **El tope se mira en la compra, no en la factura.** "Se aprueba una sola vez": si la compra se autorizó dentro del tope (o la firmó quien corresponde), la factura que cruza no pide otra firma. En la OP, el renglón sale aprobado solo si: remito firmado + factura igual a lo que falta facturar de la compra (menos de $1) + compra autorizada. `evaluarTope` no cambia: recibe la compra en vez de la factura.
4. **Saldo de la compra, derivado.** Importe acordado − facturas que cruzan. Si se pasa, la factura pide firma (se compró más de lo autorizado).
5. **Excepciones, cada una con su regla:**
   - Factura sin remito: siempre excepción (ya es así).
   - Factura sin compra: pide firma como hoy.
   - Compra sin factura (en negro): aprobación sí o sí o pago en el momento. Necesita un renglón de OP que no sea una factura: hay que decidir si se carga como comprobante tipo "Sin factura" en `cc.comprobantes` (así el resto no cambia).
   - Anticipos: no.
6. **Cotizaciones**: quedan en ClickUp; la app muestra el link y, si hace falta, la comparación (skill comparar-presupuestos).

## Para que no sea una cascada

- El renglón de la OP sigue siendo (factura, unidad): la compra se cuelga del remito y no cambia OP, aprobación, pago ni gastos.
- Todo derivado: estado de la compra y saldo en una vista, nada guardado a mano.
- Lo único que cambia de lo hecho es de dónde sale el monto que se compara con el tope.

## Preguntas para Adriano

1. En ClickUp, ¿qué lista y qué estado quieren decir "compra confirmada"? De ahí la lee el plomero.
2. El importe de la compra, ¿con IVA o sin IVA? (Hoy el remito se acepta contra el total o el neto.)
3. ¿Quién autoriza la compra hoy en ClickUp, y queda escrito en la tarea?
4. Compra en negro: ¿se carga como comprobante "Sin factura" para que pase por la OP como cualquier otra?
