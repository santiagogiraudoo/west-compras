-- Gasto por propiedad al pagar (03_definiciones, "Unidades y categorías"; Adriano 17/11):
-- "todo gasto va a una unidad; si la unidad es una propiedad o grupo de la app de
-- alquileres, además cae ahí". Cada factura pagada genera su gasto. No se guarda: lo
-- deriva app.v_gastos de las OP pagadas y de esta tabla, así un pago corregido corrige
-- su gasto solo. Al unir con la app de alquileres, el destino pasa a ser el id de la
-- propiedad o del grupo. Se aplica con el dueño de la base. Aplicado en dev-app-compras el 18/11.

create table if not exists app.unidades_destino (
  unidad_codigo text not null references cc.unidades(codigo),
  destino       text not null,
  tipo          text not null check (tipo in ('propiedad', 'grupo')),
  parte         numeric not null check (parte > 0 and parte <= 1),
  a_confirmar   text,
  primary key (unidad_codigo, destino)
);
grant select, insert, update, delete on app.unidades_destino to app_compras;

-- Las unidades sin fila acá (Oficina, BRU Café, etc.) quedan como unidad sola.
-- Las que van a más de un destino reparten en partes que suman 1.
insert into app.unidades_destino (unidad_codigo, destino, tipo, parte, a_confirmar) values
  ('UN-02', 'West Club', 'propiedad', 1, 'La app también tiene "Casa WEST CLUB": ¿parte del gasto va ahí?'),
  ('UN-03', 'Iselin 90', 'propiedad', 1, null),
  ('UN-10', 'Tirasso 5400', 'propiedad', 1, null),
  ('UN-11', 'Salta 186', 'propiedad', 1, null),
  ('UN-12', 'West Mall', 'grupo', 1, 'La propiedad suelta "West Mall - Local 209" no está en el grupo'),
  ('UN-14', 'Hipólito Yrigoyen 1450', 'propiedad', 1, null),
  ('UN-16', 'Complejo Bombal 465', 'grupo', 1, null),
  ('UN-18', 'Secadero Calle Larga', 'propiedad', 1, null),
  ('UN-21', 'Olascoaga 107 - Locales (23%)', 'grupo', 0.23, 'Piso 3 y Azotea no entran en el reparto'),
  ('UN-21', 'Olascoaga 107 - Oficinas (77%)', 'grupo', 0.77, 'Piso 3 y Azotea no entran en el reparto'),
  ('UN-28', 'Republica de Siria 339', 'propiedad', 1, null),
  ('UN-29', 'Moreno - Day', 'grupo', 1, null),
  ('UN-30', 'Gutierrez 110', 'grupo', 1, null),
  ('UN-31', 'Corrientes y Lugones', 'propiedad', 1, null),
  ('UN-32', 'Parking Alem', 'propiedad', 1, null),
  ('UN-33', 'Nevado Golf (propiedad 1)', 'propiedad', 0.5, 'En la app hay dos propiedades "Nevado Golf": al unir, cada mitad va a una por su id'),
  ('UN-33', 'Nevado Golf (propiedad 2)', 'propiedad', 0.5, 'En la app hay dos propiedades "Nevado Golf": al unir, cada mitad va a una por su id'),
  ('UN-34', 'Comandante Salas 556', 'grupo', 1, null),
  ('UN-35', 'Quiroga 1110', 'grupo', 1, null),
  ('UN-37', 'Avellaneda 165', 'propiedad', 1, null)
on conflict (unidad_codigo, destino) do nothing;

-- Un gasto por renglón pagado (factura y unidad) y destino, de West Desarrolladora.
-- Unidad sin destino: un gasto de la unidad sola. El redondeo va al primer destino, así
-- los gastos de un renglón suman exacto lo pagado. Fecha: la de salida de caja.
create or replace view app.v_gastos as
with base as (
  select o.numero as op_numero, coalesce(o.fecha_salida_caja, o.fecha_op) as fecha, o.titular,
    c.id as comprobante_id, c.proveedor_codigo, c.tipo, c.numero as factura, c.categoria,
    r.unidad_codigo, r.importe, d.destino, d.tipo as destino_tipo, coalesce(d.parte, 1) as parte,
    row_number() over (partition by o.numero, c.id, r.unidad_codigo order by d.parte desc nulls last, d.destino) as rn
  from cc.ordenes_pago o
  join app.v_op_renglones r on r.op_numero = o.numero
  join cc.comprobantes c on c.id = r.comprobante_id
  join cc.unidades u on u.codigo = r.unidad_codigo and u.marca = 'West Desarrolladora'
  left join app.unidades_destino d on d.unidad_codigo = r.unidad_codigo
  where o.estado = 'Pagada'),
partes as (select *, round(importe * parte, 2) as monto from base)
select op_numero, fecha, titular, comprobante_id, proveedor_codigo, tipo, factura, categoria,
  unidad_codigo, destino, destino_tipo,
  monto + case when rn = 1 then importe - sum(monto) over (partition by op_numero, comprobante_id, unidad_codigo) else 0 end as importe
from partes;
grant select on app.v_gastos to app_compras;
