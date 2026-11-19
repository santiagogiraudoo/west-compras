# Órdenes de compra (18/11/2026)

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

## Decisiones (Adriano, 18/11)

1. **Cuándo entra**: la lista Compras de ClickUp va por pedido confirmado → esperando remito → hecho. "Hecho" es cuando pasaron el remito. La compra entra a la base desde "pedido confirmado".
2. **Importe**: siempre el total con IVA. El IVA lo ven Candela y el plomero con su Excel.
3. **Quién autoriza**: normalmente quien la pide o el encargado de la unidad.
4. **Compra en negro**: se carga como comprobante "Sin factura" (la base ya lo acepta) y pasa por la OP como cualquier otra.

## Hecho en la base (sql/017, dev y production)

- `cc.compras` y `cc.cargar_compras` (claves: ClickUp id, Nombre, Proveedor (elegir), Unidad, Importe, Para qué, Estado, Pidió, Autorizó, Fecha, Remitos). Frena proveedor sin alta, unidad que no existe y un remito en dos compras.
- `cc.remitos.compra_id`: la compra se cuelga del remito.
- `app.v_compras`: facturado (facturas de sus remitos firmados), saldo y qué le falta cargar.

## Estándar de la compra en ClickUp (Adriano 18/11)

La suscripción de ClickUp no deja hacer obligatorios los campos, así que la compra se escribe en un **bloque fijo al principio de la descripción**. Lo lee la base (`cc._leer_compra`, sql/018), así el plomero, la app y quien sea lo leen igual.

```
Unidad: UN-03 · Iselín 90
Proveedor: Defer
Total con IVA: $1.234.567,89
Para qué: hierros y cemento para la losa
Pidió: Santi Demattia
Autorizó: Santiago López Demattia
```

Abajo, libre: materiales, entrega, contratista, lo que haga falta.

**Reglas**
1. **Nombre de la tarea**: `Obra - Qué - dd/mm/aa` (como ya se hace).
2. **Antes de pasar a "pedido confirmado"** tienen que estar Unidad, Proveedor, Total con IVA y Autorizó. Si falta alguno, la compra entra igual pero no cruza: la factura va a pedir firma (`app.v_compras.falta` dice qué falta).
3. **Unidad**: el código (`UN-03`) o el nombre exacto de la unidad. Como en el desplegable de ClickUp: `UN-03 · ISELIN 90`.
4. **Proveedor**: el nombre como está dado de alta (es el mismo del campo Proveedor de ClickUp; si el campo está puesto, gana). Un proveedor sin alta frena la compra: primero el alta.
5. **Total con IVA**: lo que se va a pagar, a la argentina (`$36.900`, `$1.234,50`). Si el precio final cambia, se corrige esta línea: factura y compra se cruzan con tolerancia cero.
6. **Una compra, una unidad y un proveedor.** Si una parte es de otra unidad o se le descuenta a un contratista (ej.: herramientas que se llevó Lucas Freire), va en otra tarea.
7. **Pidió**: si no está, se toma el creador de la tarea. **Autorizó**: quien la pidió o el encargado de la unidad.
8. **Compra en negro**: igual, y la factura se carga como "Sin factura".
9. Las negritas, viñetas y mayúsculas no molestan (`**Total con IVA:** $1.000` sirve). Líneas como "Total parcial" no se confunden con el total.

## Lo que falta

- **Que se use el estándar**: pasarlo a quien carga compras (Santi Demattia) y a las skills que crean tareas de Compras.
- **El plomero**: hecho en la rama `compras-a-neon` de west-plomero (falta unirla). Carga cada tarea desde "pedido confirmado" en cada corrida de `completar` (las actualizadas en los últimos 30 días), con llave propia `MODO_COMPRAS`; sin unidad escrita usa la del nombre de la tarea, y liga los remitos que la compra nombra. Tests: 150 pasan; el único que falla (`test_destino_pago`, pide `NEON_URL`) falla igual en main.
- **La app**: el tope se evalúa contra la compra (`evaluarTope` recibe la compra en vez de la factura) y la tarjeta de aprobación muestra la compra y su saldo. Se hace cuando haya compras cargadas.
