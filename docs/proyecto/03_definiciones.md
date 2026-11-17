# Definiciones de Adriano (17/11/2026)

Respuestas a las preguntas abiertas del doc "App de compras y pagos · estados, formatos y topes" (https://claude.ai/artifact/EtDnkHfL23y49xFS7jbXGR). Mandan sobre `01_mapa_datos.md` y `02_plan_por_partes.md` donde choquen.

| Tema | Decisión |
|---|---|
| Alcance | Solo West Desarrolladora. Dejar previsto el sistema de cuenta corriente entre entidades de la app de alquileres: West Desarrolladora le da o le toma plata a West Capital |
| Orden de compra | Sigue en ClickUp (comparar presupuestos, plazos, entrega). Entra a la app recién con el remito o la confirmación de compra |
| Aprobar | Una sola vez: si la compra estaba dentro del tope y la factura cruza, no hay segunda firma |
| Tolerancia | Cero: solo centavos (menos de $1) |
| Tarjeta de aprobación | Alcanza por ahora; se ajusta viéndola andar |
| Topes | Se definen después y son editables. En dólar blue promedio compra/venta, tomado de una API |
| Quién aprueba | En West Desarrolladora, Nandy no. Terminada la obra de West Club, todos los pagos pasan por Adriano |
| Presupuesto | Uno por obra; propiedades, por mes, 1 o 2 cánones |
| Base | La cuenta corriente de proveedores pasa a la base de la app de alquileres al unir |
| Gasto | Cada factura pagada genera su gasto con la caja de la que salió |
| Entidades | West Capital = family office, distinción interna. West Desarrolladora = unidad de negocio de propiedades, tampoco es entidad real (se va a constituir una SAS con ese nombre: no confundir). Los titulares reales son Giraudo Hernando, Yrigoyen Developer y Doblege |
| Cajas | Cuando la app esté operativa se separan las cajas de West Desarrolladora y West Capital. Plata de alquileres usada para el Feedlot = crédito a favor de West Desarrolladora frente a West Capital, no gasto |
| Categorías | Una sola lista: la de la app (Servicios, Seguros, Reparaciones, Comisiones, Mejoras, Honorarios, Otros) con Tasas en vez de ABL. Falta encajar los 15 rubros de materiales de cc |
| Proveedor | Persona de la app dada de alta como proveedor, con sus datos extra |
| Sin respuesta | Si los encargados aprueban retiros solos |

## Lo que cambia en el plan
- Las unidades de West Capital (Feedlot, El Estribo, Secadero, The Club, Bikes, etc.) quedan fuera de la bandeja de la app. Falta marcar qué unidades de `cc.unidades` son de West Desarrolladora (columna `marca`).
- No hay orden de compra propia en la app (por ahora): la "compra" que se cruza con el remito y la factura es la de ClickUp, que entra con su remito o su confirmación.
