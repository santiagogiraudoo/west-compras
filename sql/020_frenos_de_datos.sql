-- Frenos de datos (19/11, análisis en docs/proyecto/08_analisis_robustez.md).
-- Se aplica con el dueño de la base. 015 a 018 son de adriano/fase-3 y 019 de ui/primer-tema.
--
-- 1. Número de comprobante con una sola clave: "0003-00045093" y "00003-00045093" son la
--    misma factura. comprobante_unico compara el texto tal cual y las dejaba entrar dos
--    veces (el histórico usa 4 dígitos de punto de venta y el plomero 5) → doble pago.
-- 2. Vencimiento anterior a la fecha: lo frena la base (la IA lee mal el año).
-- 3. OP de la app: no imputa comprobantes de otro proveedor ni más que lo que falta pagar,
--    con la factura bloqueada mientras se imputa (dos personas a la vez no la pasan).
-- 4. app.v_controles vigila lo mismo en lo que ya está cargado (ClickUp, histórico).

-- 1 -------------------------------------------------------------------------------
-- La misma regla que claveComprobante() en src/lib/facturas/lectura.ts (con tests): punto de
-- venta y número como números ("3-45093") + el sufijo de factura partida por unidad sin
-- separadores ("A", "FEEDLOT"). Lo que no es punto de venta y número va entero, sin
-- acentos, en mayúsculas y sin espacios de más.
create or replace function cc._clave_comprobante(t text) returns text
language sql immutable parallel safe as $$
  with l as (
    select btrim(regexp_replace(upper(translate(coalesce(t, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '\s+', ' ', 'g')) s
  ), m as (
    select s, regexp_match(s, '^(\d{1,5}) ?- ?(\d{1,8})(?!\d)(.*)$') g from l
  )
  select case when g is null then s
    else (g[1])::bigint || '-' || (g[2])::bigint || '|' || regexp_replace(g[3], '[^A-Z0-9]', '', 'g') end
  from m
$$;

-- Si esto falla por "could not create unique index", hay comprobantes repetidos con el número
-- escrito distinto: listarlos con
--   select proveedor_codigo, cc._clave_comprobante(numero), array_agg(id || ' ' || numero)
--   from cc.comprobantes group by 1, 2 having count(*) > 1;
-- y anular uno antes de aplicar. En dev (19/11) no hay ninguno.
create unique index if not exists comprobante_unico_clave
  on cc.comprobantes (proveedor_codigo, cc._clave_comprobante(numero));

-- 2 -------------------------------------------------------------------------------
-- not valid: no revisa lo cargado (hay un caso viejo, lo muestra v_controles), sí lo nuevo.
alter table cc.comprobantes drop constraint if exists vencimiento_despues_de_fecha;
alter table cc.comprobantes add constraint vencimiento_despues_de_fecha
  check (vencimiento is null or fecha is null or vencimiento >= fecha) not valid;

-- 3 -------------------------------------------------------------------------------
create or replace function cc._controlar_imputacion_app() returns trigger language plpgsql as $$
declare v_op cc.ordenes_pago; v_c cc.comprobantes; v_otras numeric;
begin
  if new.comprobante_id is null or new.importe = 0 then return new; end if;
  select * into v_op from cc.ordenes_pago where numero = new.op_numero;
  if v_op.origen is distinct from 'app' then return new; end if;

  -- La factura queda bloqueada hasta que termine la transacción: la segunda OP que la
  -- quiera imputar espera y después ve lo que imputó la primera.
  select * into v_c from cc.comprobantes where id = new.comprobante_id for update;

  if v_c.proveedor_codigo <> v_op.proveedor_codigo then
    raise exception 'La factura % es de %, no de % (proveedor de la OP %)',
      v_c.numero, v_c.proveedor_codigo, v_op.proveedor_codigo, v_op.numero;
  end if;
  if sign(new.importe) <> sign(v_c.total) and v_c.total <> 0 then
    raise exception 'El importe imputado a % tiene que tener el signo de su total', v_c.numero;
  end if;

  select coalesce(sum(i.importe), 0) into v_otras
  from cc.imputaciones i join cc.ordenes_pago o on o.numero = i.op_numero
  where i.comprobante_id = new.comprobante_id and o.estado <> 'Anulada'
    and i.id is distinct from new.id;
  if abs(v_otras + new.importe) > abs(v_c.total) + 0.009 then
    raise exception 'A % le faltan pagar %: no se le pueden imputar % (posible doble pago)',
      v_c.numero, cc._monto(abs(v_c.total) - abs(v_otras)), cc._monto(abs(new.importe));
  end if;
  return new;
end $$;

drop trigger if exists controlar_imputacion_app on cc.imputaciones;
create trigger controlar_imputacion_app before insert or update of importe, comprobante_id, op_numero
  on cc.imputaciones for each row execute function cc._controlar_imputacion_app();

-- 3b ------------------------------------------------------------------------------
-- Pago de una OP de la app (amplía el trigger de sql/009):
-- - Se paga por lo que suman sus imputaciones: si total_imputado quedó desfasado (dos que
--   sacaban facturas a la vez), el neto saldría mal y se transferiría de más.
-- - Una OP de la app ya pagada no vuelve a Prevista ni se anula.
create or replace function cc._controlar_pago_app() returns trigger language plpgsql as $$
declare v_estado text; v_suma numeric;
begin
  if old.origen = 'app' and old.estado = 'Pagada' and new.estado is distinct from 'Pagada' then
    raise exception 'OP % ya está pagada: no se anula ni vuelve atrás', new.numero;
  end if;
  if new.estado = 'Pagada' and old.estado is distinct from 'Pagada' and new.origen = 'app' then
    select estado into v_estado from app.v_op_estado where op_numero = new.numero;
    if v_estado is distinct from 'Autorizada' then
      raise exception 'OP % está %: solo se paga una OP Autorizada', new.numero, coalesce(v_estado, 'sin estado');
    end if;
    select coalesce(sum(importe), 0) into v_suma from cc.imputaciones where op_numero = new.numero;
    if abs(v_suma - new.total_imputado) >= 0.01 then
      raise exception 'OP %: el total (%) no es lo que suman sus facturas (%)',
        new.numero, cc._monto(new.total_imputado), cc._monto(v_suma);
    end if;
  end if;
  return new;
end $$;

-- 3c ------------------------------------------------------------------------------
-- La última decisión de cada renglón es la última grabada (id), no la de creado_en: now()
-- es el inicio de la transacción, y la que esperó el bloqueo de la OP empezó antes pero
-- grabó después. Ordenar por creado_en podía dar por buena la decisión pisada.
create or replace view app.v_aprobacion_linea as
select op_numero, comprobante_id, decision, motivo, usuario, creado_en, unidad_codigo
from (
  select distinct on (op_numero, comprobante_id, coalesce(unidad_codigo, ''))
    op_numero, comprobante_id, decision, motivo, usuario, creado_en, unidad_codigo
  from app.aprobaciones_op
  order by op_numero, comprobante_id, coalesce(unidad_codigo, ''), id desc
) ultima
where decision <> 'Quitada';

-- 4 -------------------------------------------------------------------------------
-- Lo mismo que 016 + dos controles nuevos al final.
create or replace view app.v_controles as
select 'Factura imputada de más'::text as control, string_agg(distinct i.op_numero, ', ') as op_numero,
  c.proveedor_codigo, c.numero || ': imputado ' || cc._monto(sum(i.importe)) || ' de ' || cc._monto(c.total) as detalle
from cc.imputaciones i
join cc.ordenes_pago o on o.numero = i.op_numero and o.estado <> 'Anulada'
join cc.comprobantes c on c.id = i.comprobante_id
group by c.id, c.proveedor_codigo, c.numero, c.total
having abs(sum(i.importe)) - abs(c.total) > 1
union all
select 'OP pagada sin autorizar', r.op_numero, o.proveedor_codigo, count(*) || ' renglón(es) sin aprobar'
from app.v_op_renglones r
join cc.ordenes_pago o on o.numero = r.op_numero and o.estado = 'Pagada' and o.origen = 'app'
left join app.v_aprobacion_linea l on l.op_numero = r.op_numero and l.comprobante_id = r.comprobante_id
  and l.unidad_codigo is not distinct from r.unidad_codigo
where l.decision is distinct from 'Aprobada'
group by r.op_numero, o.proveedor_codigo
union all
select 'Renglones no suman lo imputado', i.op_numero, o.proveedor_codigo,
  'imputado ' || cc._monto(sum(i.importe)) || ', renglones ' || cc._monto(coalesce(max(r.total), 0))
from cc.imputaciones i
join cc.ordenes_pago o on o.numero = i.op_numero and o.origen = 'app'
left join (select op_numero, sum(importe) total from app.v_op_renglones group by op_numero) r on r.op_numero = i.op_numero
where i.comprobante_id is not null
group by i.op_numero, o.proveedor_codigo
having abs(sum(i.importe) - coalesce(max(r.total), 0)) >= 0.01
union all
select 'Total de la OP no cierra', o.numero, o.proveedor_codigo,
  'total ' || cc._monto(o.total_imputado) || ', imputaciones ' || cc._monto(sum(i.importe))
from cc.ordenes_pago o join cc.imputaciones i on i.op_numero = o.numero
where o.origen = 'app' and o.estado <> 'Anulada'
group by o.numero, o.proveedor_codigo, o.total_imputado
having abs(o.total_imputado - sum(i.importe)) >= 1
union all
select 'Unidad sin aprobador', r.op_numero, o.proveedor_codigo, 'Unidad ' || r.unidad_codigo
from app.v_op_renglones r
join app.v_op_estado e on e.op_numero = r.op_numero and e.estado in ('A aprobar', 'Observada', 'Bloqueada')
join cc.ordenes_pago o on o.numero = r.op_numero
left join app.aprobadores a on a.unidad_codigo = r.unidad_codigo
left join app.users u on u.id = a.usuario_id and u.active
where u.id is null
group by r.op_numero, o.proveedor_codigo, r.unidad_codigo
union all
-- Nuevo (020): una OP viva que paga un comprobante de otro proveedor.
select 'OP paga factura de otro proveedor', o.numero, o.proveedor_codigo,
  c.numero || ' es de ' || c.proveedor_codigo
from cc.imputaciones i
join cc.ordenes_pago o on o.numero = i.op_numero and o.estado <> 'Anulada'
join cc.comprobantes c on c.id = i.comprobante_id
where i.importe <> 0 and c.proveedor_codigo <> o.proveedor_codigo
union all
-- Nuevo (020): vencimiento antes de la fecha en una factura que todavía se debe.
select 'Vence antes de su fecha', null, c.proveedor_codigo,
  c.numero || ': fecha ' || to_char(c.fecha, 'DD/MM/YYYY') || ', vence ' || to_char(c.vencimiento, 'DD/MM/YYYY')
from cc.comprobantes c
where c.vencimiento < c.fecha and c.estado_aprobacion <> 'Anulado';

grant select on app.v_controles to app_compras;

insert into app.migraciones (archivo, huella) values ('020_frenos_de_datos.sql', null)
on conflict (archivo) do nothing;
