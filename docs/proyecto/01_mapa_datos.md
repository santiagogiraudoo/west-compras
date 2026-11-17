# App de compras y pagos · mapa de datos (17/11/2026)

Qué tabla de la base de proveedores (Neon west-cc, esquema `cc`) corresponde a qué modelo de la app de alquileres (santiagogiraudoo/west-desarrolladora), y qué falta crear. Borrador para definir con Santiago.

## 1. Lo que ya existe en la app de alquileres y se reutiliza

| cc (hoy) | App de alquileres | Cómo se une | Ojo |
|---|---|---|---|
| `titulares` (Giraudo Hernando, Yrigoyen Developer, Doblege) | `Company` (West Desarrolladora, West Capital) | Cada titular como empresa con CUIT | Marca (de quién es el negocio) ≠ titular (a nombre de quién está la factura). Definir |
| `ordenes_pago` pagada | `Caja` + `CajaEntry` + `Expense` | El pago sale de una caja; cada factura imputada genera su gasto | La caja general hoy está en el Excel de Bruno |
| `comprobantes` de una propiedad o grupo | `Expense` (propiedad / grupo / cartera, reparto, traslado al inquilino) | La factura de un arreglo termina en un gasto de esa propiedad | Solo unidades que son propiedades |
| `cambios` | `AuditLog` | Una sola auditoría | — |
| `personas` (aprobadores) | `User` | Cada aprobador es un usuario | Roles admin/operador/consulta no alcanzan para topes por unidad |
| Links a SharePoint | `Attachment` | Factura, remito, comprobante y certificados | Mantener el item_id de SharePoint |
| `proveedores` | `Person` | Persona jurídica o física | Falta CBU, condición de IVA, plazo, rubro: perfil de proveedor 1 a 1 |

## 2. Lo que se trae de cc

| cc | Modelo en la app | Notas |
|---|---|---|
| `unidades` (34) | `BusinessUnit` con link opcional a `Property`/`PropertyGroup` | Feedlot, West Club, Oficina no son propiedades. Todo gasto va a una unidad; si la unidad es una propiedad, además cae ahí |
| `comprobantes` + `comprobante_items` | `SupplierInvoice` + items | "Pagada" se deriva (saldo 0) |
| `remitos` | `DeliveryNote` | Quién retiró y quién autorizó como FK |
| `ordenes_pago` + `imputaciones` | `PaymentOrder` + `PaymentOrderLine` | Aprobación por línea |
| `op_estados`, `op_cc`, `reservas_op` | — | Desaparecen (estado propio, sin CC mensual, número por la base) |
| `cheques_asignados` | Más adelante | Chequera |
| `rubros` | ¿Unificar con categorías de gasto? | Definir |
| `documentos`, `ejecuciones`, `plomero_estado`, `log_cargas`, `movimientos` | Quedan del lado del plomero | — |

## 3. Tablas nuevas (esquema `app`)

| Modelo | Para qué |
|---|---|
| `PurchaseOrder` + items | La compra, con link a la tarea de ClickUp |
| `Quote` | Cotizaciones para elegir |
| `Approval` | Quién aprobó, observó o bloqueó qué y cuándo |
| `Approver` | Quién aprueba qué unidad y hasta cuánto (montos: Santiago) |
| `UnitBudget` | Presupuesto por unidad, si se usa |
| `WhatsappMessage` | Lo que entra por el bot de remitos |

## 4. Reglas que viven en la base

Factura repetida y total que no cierra → rechazo · pago que no cuadra → rechazo · OP autorizada solo con todas sus líneas aprobadas · proveedor sin alta completa → no se paga · compra sin factura → aprobación siempre o pago en el momento.
