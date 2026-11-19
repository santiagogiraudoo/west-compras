-- app.v_controles sin "Factura en OP de la app y de ClickUp" (18/11): cc.v_alertas ya avisa
-- "Factura en dos OP" por lo mismo y en el Inicio salía dos veces. El freno sigue en el
-- trigger de sql/015. Se aplica con scripts/aplicar-sql.ts.

drop view if exists app.v_controles;
create view app.v_controles as
-- A una factura se le imputa más que su total, sumando todas las OP vivas.
select 'Factura imputada de más' as control, string_agg(distinct i.op_numero, ', ') as op_numero, c.proveedor_codigo,
  c.numero || ': imputado ' || cc._monto(sum(i.importe)) || ' de ' || cc._monto(c.total) as detalle
from cc.imputaciones i
join cc.ordenes_pago o on o.numero = i.op_numero and o.estado <> 'Anulada'
join cc.comprobantes c on c.id = i.comprobante_id
group by c.id, c.proveedor_codigo, c.numero, c.total
having abs(sum(i.importe)) - abs(c.total) > 1
union all
-- OP de la app pagada con algún renglón sin aprobar (el trigger lo frena; esto vigila).
select 'OP pagada sin autorizar', r.op_numero, o.proveedor_codigo, count(*) || ' renglón(es) sin aprobar'
from app.v_op_renglones r
join cc.ordenes_pago o on o.numero = r.op_numero and o.estado = 'Pagada' and o.origen = 'app'
left join app.v_aprobacion_linea l on l.op_numero = r.op_numero and l.comprobante_id = r.comprobante_id
  and l.unidad_codigo is not distinct from r.unidad_codigo
where l.decision is distinct from 'Aprobada'
group by r.op_numero, o.proveedor_codigo
union all
-- El reparto por unidad no suma lo imputado.
select 'Renglones no suman lo imputado', i.op_numero, o.proveedor_codigo,
  'imputado ' || cc._monto(sum(i.importe)) || ', renglones ' || cc._monto(coalesce(max(r.total), 0))
from cc.imputaciones i
join cc.ordenes_pago o on o.numero = i.op_numero and o.origen = 'app'
left join (select op_numero, sum(importe) total from app.v_op_renglones group by op_numero) r on r.op_numero = i.op_numero
where i.comprobante_id is not null
group by i.op_numero, o.proveedor_codigo
having abs(sum(i.importe) - coalesce(max(r.total), 0)) >= 0.01
union all
-- La OP no suma lo que imputa.
select 'Total de la OP no cierra', o.numero, o.proveedor_codigo,
  'total ' || cc._monto(o.total_imputado) || ', imputaciones ' || cc._monto(sum(i.importe))
from cc.ordenes_pago o join cc.imputaciones i on i.op_numero = o.numero
where o.origen = 'app' and o.estado <> 'Anulada'
group by o.numero, o.proveedor_codigo, o.total_imputado
having abs(o.total_imputado - sum(i.importe)) >= 1
union all
-- Renglón esperando firma de una unidad que no tiene quién la apruebe.
select 'Unidad sin aprobador', r.op_numero, o.proveedor_codigo, 'Unidad ' || r.unidad_codigo
from app.v_op_renglones r
join app.v_op_estado e on e.op_numero = r.op_numero and e.estado in ('A aprobar', 'Observada', 'Bloqueada')
join cc.ordenes_pago o on o.numero = r.op_numero
left join app.aprobadores a on a.unidad_codigo = r.unidad_codigo
left join app.users u on u.id = a.usuario_id and u.active
where u.id is null
group by r.op_numero, o.proveedor_codigo, r.unidad_codigo;

grant select on app.v_controles to app_compras;
