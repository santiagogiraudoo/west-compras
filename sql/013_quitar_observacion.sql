-- Quitar una observación o un bloqueo (18/11): el renglón vuelve a "sin decidir", sin
-- pasar por aprobado. Se agrega una decisión 'Quitada' (con comentario, como observar)
-- y la vista de la última decisión la saltea: el renglón queda sin decisión y la OP
-- vuelve a "A aprobar" si no queda otro renglón frenado. La historia sigue completa en
-- app.aprobaciones_op. Se aplica con el dueño de la base. Aplicado en dev-app-compras el 18/11.

alter table app.aprobaciones_op drop constraint if exists aprobaciones_op_decision_check;
alter table app.aprobaciones_op add constraint aprobaciones_op_decision_check
  check (decision in ('Aprobada', 'Observada', 'Bloqueada', 'Quitada'));

-- observada_con_motivo ya pide comentario (5 letras o más) para todo lo que no es
-- 'Aprobada': quitar también lo pide.

-- La última decisión de cada renglón (factura y unidad), salvo que sea 'Quitada'.
-- Mismas columnas y en el mismo orden: app.v_op_estado la usa.
create or replace view app.v_aprobacion_linea as
select op_numero, comprobante_id, decision, motivo, usuario, creado_en, unidad_codigo
from (
  select distinct on (op_numero, comprobante_id, coalesce(unidad_codigo, ''))
    op_numero, comprobante_id, decision, motivo, usuario, creado_en, unidad_codigo
  from app.aprobaciones_op
  order by op_numero, comprobante_id, coalesce(unidad_codigo, ''), creado_en desc, id desc
) ultima
where decision <> 'Quitada';
