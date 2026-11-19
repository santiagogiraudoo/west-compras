-- Frenos y controles de la base (18/11). Se aplica con el dueño de la base.
-- 013 y 014 quedan para los de la rama ui/primer-tema (Fmarull), ya aplicados en dev.
--
-- 1. app.migraciones: qué archivos de sql/ tiene aplicados esta base, con su huella.
--    Lo llena scripts/aplicar-sql.ts; así dev y production no se separan sin que se note.
-- 2. Doble pago con ClickUp, frenado en la base: una OP de la app no puede imputar una
--    factura que una OP prevista de ClickUp ya lleva (cc.op_cc 'factura:<id>'). Antes lo
--    frenaba solo una consulta de la app: código viejo o de otra rama lo salteaba.
-- 3. Las decisiones de aprobación no se editan ni se borran: se agrega una nueva.
--    Y la automática por tope guarda la cotización usada, como número.
-- 4. app.v_controles: lo que no cierra. Cada fila es un error; vacía = todo bien.
--    Va al Inicio como una alerta más.

-- 1 -------------------------------------------------------------------------------
create table if not exists app.migraciones (
  archivo      text primary key,
  huella       text,          -- sha256 del archivo; null = aplicado antes del registro
  aplicado_en  timestamptz not null default now(),
  aplicado_por text not null default current_user
);
grant select on app.migraciones to app_compras;

insert into app.migraciones (archivo, huella) values
  ('000_rol_app_compras.sql', null), ('001_app_usuarios.sql', null), ('002_reservas_op.sql', null),
  ('003_cuenta_proveedores.sql', null), ('004_cuenta_proveedores_datos.sql', null),
  ('005_categoria_comprobantes.sql', null), ('006_categoria_aprobadas.sql', null),
  ('007_aprobacion_y_pago_op.sql', null), ('008_cuentas_production.sql', null),
  ('009_aprobadores_y_estados_op.sql', null), ('010_comprobantes_pago.sql', null),
  ('011_renglones_por_unidad.sql', null), ('012_gastos_por_propiedad.sql', null)
on conflict (archivo) do nothing;

-- 2 -------------------------------------------------------------------------------
create or replace function cc._frenar_doble_pago_app() returns trigger language plpgsql as $$
declare v_ops text;
begin
  if new.comprobante_id is null or new.importe = 0 then return new; end if;
  if (select origen from cc.ordenes_pago where numero = new.op_numero) is distinct from 'app' then
    return new;
  end if;
  select string_agg(distinct o.numero, ', ') into v_ops
  from cc.op_cc oc join cc.ordenes_pago o on o.numero = oc.op_numero
  where oc.cc_clickup_id = 'factura:' || new.comprobante_id
    and o.numero <> new.op_numero and o.estado = 'Prevista';
  if v_ops is not null then
    raise exception 'La factura % ya está en la OP % de ClickUp (posible doble pago)',
      (select numero from cc.comprobantes where id = new.comprobante_id), v_ops;
  end if;
  return new;
end $$;

drop trigger if exists frenar_doble_pago_app on cc.imputaciones;
create trigger frenar_doble_pago_app before insert or update of importe on cc.imputaciones
  for each row execute function cc._frenar_doble_pago_app();

-- 3 -------------------------------------------------------------------------------
alter table app.aprobaciones_op add column if not exists cotizacion_blue numeric;
revoke update, delete, truncate on app.aprobaciones_op from app_compras;

create or replace function app._aprobaciones_solo_agregar() returns trigger language plpgsql as $$
begin
  raise exception 'Las decisiones de aprobación no se editan ni se borran: se agrega una nueva';
end $$;
drop trigger if exists aprobaciones_solo_agregar on app.aprobaciones_op;
create trigger aprobaciones_solo_agregar before update or delete on app.aprobaciones_op
  for each row execute function app._aprobaciones_solo_agregar();

-- 4 -------------------------------------------------------------------------------
create or replace view app.v_controles as
-- Factura en una OP viva de la app y en una prevista de ClickUp a la vez.
select 'Factura en OP de la app y de ClickUp' as control, o.numero as op_numero,
  c.proveedor_codigo, c.numero || ' también en ' || string_agg(distinct k.numero, ', ') as detalle
from cc.imputaciones i
join cc.ordenes_pago o on o.numero = i.op_numero and o.origen = 'app' and o.estado <> 'Anulada'
join cc.comprobantes c on c.id = i.comprobante_id
join cc.op_cc oc on oc.cc_clickup_id = 'factura:' || i.comprobante_id
join cc.ordenes_pago k on k.numero = oc.op_numero and k.numero <> o.numero and k.estado = 'Prevista'
where i.importe <> 0
group by o.numero, c.proveedor_codigo, c.numero
union all
-- A una factura se le imputa más que su total, sumando todas las OP vivas.
select 'Factura imputada de más', string_agg(distinct i.op_numero, ', '), c.proveedor_codigo,
  c.numero || ': imputado ' || cc._monto(sum(i.importe)) || ' de ' || cc._monto(c.total)
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
