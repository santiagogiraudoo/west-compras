# 09 · Flujo de entrada de documentos (19/11)

Cómo entra a la app todo papel de una compra (factura, nota de crédito, remito, comprobante
de pago) y qué pasa con él hasta la Bandeja. Decisión del 19/11: **un buzón único y un solo
procesador, en la app**. Hoy lo operativo sigue en ClickUp y el plomero; esto es el destino
que se construye y se prueba en desarrollo.

## El flujo

```
 Canales                Buzón (app.entrada)         Procesador (src/lib/entrada)           Resultado
 ─────────              ──────────────────          ─────────────────────────────          ─────────
 App: subir      ─┐                                 1. Leer: una llamada a Claude que
 WhatsApp        ─┼──►  un archivo = una fila  ──►     dice qué es y lo extrae          ──► Factura Pendiente
 Mail            ─┘     (hash: el mismo archivo     2. Controlar (contrato de lectura)      (cc.cargar_nuevos)
                         por dos canales entra      3. Proveedor: por CUIT; por WhatsApp ──► Remito
                         una sola vez)                 también por el teléfono               (cc.cargar_remitos)
                                                    4. Decidir qué hacer                 ──► Remito ↔ factura
                                                    5. Cruzar remitos con facturas          cruzados
                                                                                         ──► A revisar, con motivo
                                                                                         ──► Descartado, con motivo
```

### 1. Canales
- **App**: "Añadir documento" (hoy "Añadir factura"). Quien sube queda como remitente.
- **WhatsApp Business**: un número al que proveedores, encargados y contratistas mandan foto o
  PDF. El remitente se reconoce por su teléfono normalizado (`549` + área + número, el mismo
  formato del alta de proveedor). El texto que acompaña ("es para West Club", "retiró Juan")
  queda guardado como pista. Se contesta con un acuse: qué se entendió o qué falta.
- **Mail**: las casillas de facturas. Mientras el plomero opere, él baja los adjuntos.

### 2. Buzón (`app.entrada`, sql/021)
Una fila por archivo: canal, remitente, archivo, `sha256` único, estado (`recibido → leido →
procesado | revisar | duplicado | descartado`), qué es (`factura`, `nota_credito`,
`nota_debito`, `remito`, `comprobante_pago`, `otro`), la lectura y lo que se hizo. Nada se
pierde: lo que no se pudo procesar queda con su motivo y se resuelve a mano.

### 3. Procesador
1. **Leer**: una sola llamada a Claude que clasifica y extrae (contrato de lectura,
   `07_ia_y_plomero.md`): structured outputs, `null` en vez de inventar, montos con
   `leerMonto`, número `PPPPP-NNNNNNNN`.
2. **Controlar**: CUIT con dígito verificador, fechas, moneda, total que cierra.
3. **Proveedor**: por CUIT del emisor. Si llega por WhatsApp de un proveedor conocido, su
   teléfono lo confirma. Sin proveedor → revisar ("dalo de alta").
4. **Decidir** (`decidirEntrada`, puro y con tests):

| Qué es | Qué se hace |
|---|---|
| Factura / NC / ND | Si ya está (misma clave) → duplicado. Si no, se carga **Pendiente** con `cc.cargar_nuevos` + ítems; lo dudoso va "⚠️ revisar". Titular por CUIT del receptor; unidad si el texto o el remito la dicen. |
| Remito | Se carga con `cc.cargar_remitos` (firmado = `ok`, sin firma = `falta`) y se cruza. |
| Comprobante de pago | No se registra solo: queda para "Registrar pago" de la OP que coincida. |
| Otro | Descartado con motivo (presupuesto, foto de stock, planilla). |

5. **Cruzar remito ↔ factura** (`cruce.ts`, reglas del plomero `completar.py`):
   el remito cita el número de la factura · la factura cita el número del remito · mismo
   proveedor, importe que cierra (menos de $1) y fecha cercana · **factura de remitos**: la
   factura es la suma de varios remitos abiertos del proveedor. El remito que llega antes que
   su factura queda abierto y se liga cuando entra la factura.

### 4. Después
La factura sigue el camino de siempre: **Bandeja** (lo que no pasó solo, con el motivo) →
**aprobación** (una sola vez; con remito cruzado y dentro del tope sale sola) → **OP** →
**pago**. Una NC queda atada a la factura que cancela (pendiente, `08_analisis_robustez.md` §5).

## Qué hace cada uno
- **App**: canales, buzón, procesador, cruce, Bandeja, OP y pago.
- **Base**: frena lo que no puede pasar (repetidos por clave, vencimiento, imputaciones).
- **Plomero**: mientras la app esté en desarrollo, sigue operando igual. Cuando la app
  procese la entrada en producción, el plomero deja de leer facturas.

## Falta para que el canal WhatsApp ande
Número de WhatsApp Business (Cloud API de Meta), y en Vercel: `WHATSAPP_TOKEN`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_ID`. El webhook es
`/api/whatsapp`.
