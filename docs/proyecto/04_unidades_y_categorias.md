# Unidades, propiedades y categorías (Adriano, 17/11/2026)

## Qué unidad es de quién
- **West Capital (fuera de la app):** UN-04 Feedlot, UN-05 El Estribo, UN-07 The Club, UN-08 West Automotores, UN-09 West Bikes, UN-25 Gastos personales, UN-36 Laura Garcia Store. `cc.unidades.marca` ya corregida en production y en dev-app-compras.
- **West Desarrolladora:** todas las demás (incluye BRU Café, West Club, Secadero, Oficina, Personal Rizza, Yrigoyen 1450).

## Unidad de cc ↔ propiedad o grupo de la app de alquileres (base Neon west-desarrolladora)

| Unidad (cc) | En la app de alquileres |
|---|---|
| UN-02 West Club | Propiedad "West Club" + "Casa WEST CLUB" |
| UN-03 Iselin 90 | Propiedad "Iselin 90" |
| UN-10 Tirasso 5400 | Propiedad "Tirasso 5400" |
| UN-11 Salta 186 | Propiedad "Salta 186" |
| UN-12 West Mall | Grupo "West Mall" + propiedad suelta "West Mall - Local 209" |
| UN-14 Yrigoyen 1450 - Geriátrico | Propiedad "Hipólito Yrigoyen 1450" |
| UN-16 Depto Bombal | Grupo "Complejo Bombal 465" |
| UN-18 Secadero | Propiedad "Secadero Calle Larga" |
| UN-21 Olascoaga 107 | Grupos "Olascoaga 107 - Locales (23%)" y "Oficinas (77%)" + "Piso 3" y "Azotea" |
| UN-28 Siria 339 | Propiedad "Republica de Siria 339" |
| UN-29 Moreno Day | Grupo "Moreno - Day" |
| UN-30 Gutiérrez y Coronel Suárez | Grupo "Gutierrez 110" |
| UN-31 Lugones y Corrientes | Propiedad "Corrientes y Lugones" |
| UN-32 Playa Alem y Mitre | Propiedad "Parking Alem" |
| UN-33 Casa Nevado Golf | Las dos propiedades "Nevado Golf", mitad y mitad |
| UN-34 Cte Salas 556 | Grupo "Comandante Salas 556" |
| UN-35 Quiroga 1110 | Grupo "Quiroga 1110" |
| UN-37 Avellaneda 167 | Propiedad "Avellaneda 165" (la misma) |
| BRU Café, Lorenzoni, Siria 455 / Libertad 1482, Masada, Oficina, Personal Rizza, Saldo cta cte, 9 de Julio | Ninguna: quedan como unidad sola |

Regla: todo gasto va a una unidad; si la unidad es una propiedad o grupo de la app, además cae ahí (y se puede trasladar al inquilino).

## Una sola lista de categorías
- Se elige de una sola lista: las de la app de alquileres (**Tasas** en vez de ABL, Servicios, Seguros, Reparaciones, Comisiones, Mejoras, Honorarios, Otros) **+ Obra + Insumos de oficina**.
- El rubro (los 15 de `cc.rubros`: Ferretería, Eléctricos, Corralón…) **no se elige**: sale del proveedor y queda para comparar precios.
- Por defecto: obras (Iselin 90, West Club, Siria, Lugones) → Obra; propiedad alquilada → Reparaciones; Oficina → Insumos de oficina; combustible → Servicios.

## Ojo al pasar a production
- `sql/004_cuenta_proveedores_datos.sql` se generó desde la rama dev (copia del 17/11 ~19 h). En production, el 17/11 ~20:30 se cargaron 21 cuentas más en `cbu_alias` (transferencias y fichas de ClickUp): hay que volver a correr `scripts/extraer-cuentas.ts` contra production antes de aplicar 003/004 ahí.
- PR-034 Centro de la Limpieza: el texto dice BBVA pero el CBU (011…) es del Banco Nación. Confirmar con el proveedor.
