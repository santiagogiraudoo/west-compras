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
| Categorías | Una sola lista: la de la app con Tasas en vez de ABL, más Obra e Insumos de oficina. El rubro sale del proveedor (ver "Unidades y categorías") |
| Proveedor | Persona de la app dada de alta como proveedor, con sus datos extra |
| Sin respuesta | Si los encargados aprueban retiros solos |

## Lo que cambia en el plan
- Las unidades de West Capital quedan fuera de la app (lista en "Unidades y categorías"; `cc.unidades.marca` ya marcada, 17/11). El Secadero es de West Desarrolladora.
- No hay orden de compra propia en la app (por ahora): la "compra" que se cruza con el remito y la factura es la de ClickUp, que entra con su remito o su confirmación.

## Unidades y categorías (Adriano, 17/11 20:23)

Salió de leer la base de la app de alquileres (Neon west-desarrolladora, solo lectura: 16 grupos y 157 propiedades, 63 sin grupo). Nada modificado allá.

### Cada unidad de West Desarrolladora y su propiedad o grupo

| Unidad (cc) | En la app de alquileres |
|---|---|
| UN-02 West Club | Propiedad "West Club" (uso propio) + "Casa WEST CLUB" |
| UN-03 Iselin 90 | Propiedad "Iselin 90" (en construcción) |
| UN-10 Tirasso 5400 | Propiedad "Tirasso 5400" |
| UN-11 Salta 186 | Propiedad "Salta 186" |
| UN-12 West Mall | Grupo "West Mall" (34 locales y oficinas) + propiedad suelta "West Mall - Local 209" |
| UN-14 Yrigoyen 1450 - Geriátrico | Propiedad "Hipólito Yrigoyen 1450" |
| UN-16 Depto Bombal | Grupo "Complejo Bombal 465" |
| UN-18 Secadero | Propiedad "Secadero Calle Larga" (uso propio) |
| UN-21 Olascoaga 107 | Grupos "Olascoaga 107 - Locales (23%)" y "Oficinas (77%)" + "Piso 3" y "Azotea" |
| UN-28 Siria 339 | Propiedad "Republica de Siria 339" |
| UN-29 Moreno Day | Grupo "Moreno - Day" |
| UN-30 Gutiérrez y Coronel Suárez | Grupo "Gutierrez 110" |
| UN-31 Lugones y Corrientes | Propiedad "Corrientes y Lugones" |
| UN-32 Playa Alem y Mitre | Propiedad "Parking Alem" |
| UN-33 Casa Nevado Golf | Las dos propiedades "Nevado Golf", **mitad y mitad** |
| UN-34 Cte Salas 556 | Grupo "Comandante Salas 556" |
| UN-35 Quiroga 1110 | Grupo "Quiroga 1110" |
| UN-37 Avellaneda 167 | Propiedad "Avellaneda 165" (es la misma) |
| UN-01 BRU Café, UN-17 Depto Lorenzoni, UN-19 Siria 455, UN-20 Libertad 1482, UN-22 Depto Masada, UN-23 Oficina, UN-24 Personal Rizza, UN-26 Saldo cta cte, UN-27 9 de Julio | Ninguna: quedan como unidad sola |

Regla: **todo gasto va a una unidad; si la unidad es una propiedad o grupo de la app, además cae ahí** (y puede trasladarse al inquilino). En Nevado Golf el gasto se reparte en partes iguales entre las dos propiedades.

Unidades de West Capital (no entran en la app): UN-04 Feedlot, UN-05 El Estribo, UN-07 The Club, UN-08 West Automotores, UN-09 West Bikes, UN-25 Gastos personales, UN-36 Laura Garcia Store. La columna `cc.unidades.marca` ya está corregida en production y en dev-app-compras.

### Una sola lista de categorías

- **Se elige una categoría por factura**, de una sola lista: la de la app de alquileres (**Tasas** en vez de ABL, Servicios, Seguros, Reparaciones, Comisiones, Mejoras, Honorarios, Otros) **más Obra e Insumos de oficina**. Va en `cc.comprobantes.categoria` (`sql/005`); la base no acepta otra.
- **El rubro no se elige:** sale del proveedor (Sierra = Eléctricos, Defer = Corralón) y queda para comparar precios. Son los 15 de cc: Ferretería, Eléctricos, Corralón, Pintura, Contratistas, Ganadería, Combustible, Hierros, Limpieza, Cerámicos y sanitarios, Insumos, Mantenimiento, Riego, Informática, Maderas.
- Uso en West Desarrolladora (facturas no anuladas, 17/11): Ferretería 168, Eléctricos 63, Corralón 58, Pintura 37, Contratistas 19, Hierros 14, Cerámicos 13, Limpieza 10, Combustible 8, Insumos 5, Ganadería 5, Mantenimiento 4, Riego 3, Informática 2, Maderas 2.

Categoría sugerida según la unidad (editable en cada factura; en la app, `categoriaSugerida`):

| Unidad | Categoría sugerida |
|---|---|
| En construcción u obra (Iselin 90, West Club, Siria 339 y 455, Lugones y Corrientes) | Obra |
| Propiedad alquilada o para alquilar | Reparaciones (o Mejoras si suma valor) |
| Oficina | Insumos de oficina / Servicios |
| Combustible | Servicios |
| Contratistas (mano de obra) | Reparaciones u Obra, según la unidad |

La categoría se pide para aprobar. Las facturas aprobadas antes de la lista única quedan sin categoría y no vuelven a la bandeja por eso (como las aprobadas sin remito).
