-- Factura con ítems de varias unidades (doc "estados", OP con varias unidades): se parte
-- por ítem y cada parte va a quien aprueba su unidad. El renglón de la OP pasa a ser
-- (factura, unidad). Se aplica con el dueño de la base. Aplicado en dev-app-compras el 18/11.

-- 1. Renglones de cada OP: una fila por factura y unidad. La unidad de un ítem es la
--    suya o, si no tiene, la de la factura. Lo imputado se reparte en proporción a los
--    subtotales de los ítems (sin subtotales, en partes iguales); el redondeo va a la
--    parte más grande, así las partes suman exacto lo imputado.
create or replace view app.v_op_renglones as
with partes as (
  select i.op_numero, i.comprobante_id, i.importe,
    coalesce(it.unidad_codigo, c.unidad_codigo) as unidad_codigo,
    sum(coalesce(it.subtotal, 0)) as sub
  from cc.imputaciones i
  join cc.comprobantes c on c.id = i.comprobante_id
  left join cc.comprobante_items it on it.comprobante_id = c.id
  where i.importe <> 0
  group by i.op_numero, i.comprobante_id, i.importe, coalesce(it.unidad_codigo, c.unidad_codigo)),
calc as (
  select p.*, sum(sub) over w as total_sub, count(*) over w as n,
    row_number() over (partition by op_numero, comprobante_id order by sub desc, unidad_codigo) as rn
  from partes p
  window w as (partition by op_numero, comprobante_id)),
redondeo as (
  select *, case when n = 1 then importe
                 when total_sub <> 0 then round(importe * sub / total_sub, 2)
                 else round(importe / n, 2) end as parte
  from calc)
select op_numero, comprobante_id, unidad_codigo,
  parte + case when rn = 1 then importe - sum(parte) over (partition by op_numero, comprobante_id) else 0 end as importe,
  n > 1 as partida
from redondeo;
grant select on app.v_op_renglones to app_compras;

-- 2. Cada decisión es sobre un renglón (factura, unidad). Las de antes eran de la
--    factura entera, que tenía una sola unidad.
alter table app.aprobaciones_op add column if not exists unidad_codigo text references cc.unidades(codigo);
update app.aprobaciones_op a set unidad_codigo = c.unidad_codigo
from cc.comprobantes c where c.id = a.comprobante_id and a.unidad_codigo is null;

create or replace view app.v_aprobacion_linea as
select distinct on (op_numero, comprobante_id, coalesce(unidad_codigo, ''))
  op_numero, comprobante_id, decision, motivo, usuario, creado_en, unidad_codigo
from app.aprobaciones_op
order by op_numero, comprobante_id, coalesce(unidad_codigo, ''), creado_en desc, id desc;

-- 3. El estado de la OP mira los renglones (factura, unidad).
create or replace view app.v_op_estado as
select o.numero as op_numero,
  case
    when o.estado = 'Pagada' then 'Pagada'
    when o.estado = 'Anulada' then 'Descartada'
    when a.enviada_en is null then 'En armado'
    when bool_or(l.decision = 'Bloqueada') then 'Bloqueada'
    when bool_or(l.decision = 'Observada') then 'Observada'
    when bool_and(coalesce(l.decision, '') = 'Aprobada') then 'Autorizada'
    else 'A aprobar'
  end as estado
from cc.ordenes_pago o
join app.ops a on a.op_numero = o.numero
left join app.v_op_renglones r on r.op_numero = o.numero
left join app.v_aprobacion_linea l on l.op_numero = r.op_numero and l.comprobante_id = r.comprobante_id
  and l.unidad_codigo is not distinct from r.unidad_codigo
group by o.numero, o.estado, a.enviada_en;
