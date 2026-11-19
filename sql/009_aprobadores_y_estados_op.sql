-- Fase 3, primera versión (18/11): quién aprueba cada unidad y los estados de la OP.
-- Se aplica con el dueño de la base. Aplicado en dev-app-compras el 18/11.
--
-- Estados (doc "estados, formatos y topes"): En armado → A aprobar → Autorizada → Pagada,
-- más Observada, Bloqueada y Descartada. No se guardan: los deriva app.v_op_estado de
-- lo que sí se guarda (si se envió, las decisiones por renglón y el estado en cc), así
-- no hay dos versiones del estado que puedan no coincidir.

-- 1. Aprobadores: unidad → usuario. Sin topes todavía: las columnas quedan vacías hasta
--    que Santiago los defina (en dólar blue, editables).
create table if not exists app.aprobadores (
  unidad_codigo  text primary key references cc.unidades(codigo),
  usuario_id     int not null references app.users(id),
  tope_compra_usd numeric check (tope_compra_usd is null or tope_compra_usd >= 0),
  tope_mes_usd    numeric check (tope_mes_usd is null or tope_mes_usd >= 0),
  actualizado_por text,
  actualizado_en  timestamptz not null default now()
);
grant select, insert, update on app.aprobadores to app_compras;

-- Por defecto todo lo aprueba Adriano (el primer admin); West Club (UN-02) es de
-- Santiago Giraudo mientras dure la obra, si ya tiene usuario (si no, se asigna en
-- Configuración cuando se lo cree).
insert into app.aprobadores (unidad_codigo, usuario_id, actualizado_por)
select u.codigo,
  case when u.codigo = 'UN-02'
    then coalesce((select id from app.users where name ilike 'Santiago Giraudo%' and active order by id limit 1),
                  (select id from app.users where role = 'admin' and active order by id limit 1))
    else (select id from app.users where role = 'admin' and active order by id limit 1) end,
  'sql/009'
from cc.unidades u
where u.marca = 'West Desarrolladora'
  and exists (select 1 from app.users where role = 'admin' and active)
on conflict (unidad_codigo) do nothing;

-- 2. OP armadas en la app: quién la armó, cuándo se mandó a aprobar, y el descarte.
create table if not exists app.ops (
  op_numero       text primary key references cc.ordenes_pago(numero),
  armada_por      text not null,
  armada_en       timestamptz not null default now(),
  enviada_por     text,
  enviada_en      timestamptz,
  descartada_por  text,
  descartada_en   timestamptz,
  motivo_descarte text,
  constraint descarte_con_motivo check (descartada_en is null or length(trim(coalesce(motivo_descarte, ''))) >= 5)
);
grant select, insert, update on app.ops to app_compras;

-- Las OP que ya se armaron en la app antes de esta tabla: como enviadas al crearse.
insert into app.ops (op_numero, armada_por, armada_en, enviada_por, enviada_en)
select numero, 'App de compras', creado_en, 'App de compras', creado_en
from cc.ordenes_pago where origen = 'app'
on conflict (op_numero) do nothing;

-- 3. Decisiones por renglón: suma Bloqueada (frena la OP como la observada, pero es
--    para lo que no se tiene que pagar así). Observar y bloquear piden comentario.
alter table app.aprobaciones_op drop constraint if exists aprobaciones_op_decision_check;
alter table app.aprobaciones_op add constraint aprobaciones_op_decision_check
  check (decision in ('Aprobada', 'Observada', 'Bloqueada'));
alter table app.aprobaciones_op drop constraint if exists observada_con_motivo;
alter table app.aprobaciones_op add constraint observada_con_motivo
  check (decision = 'Aprobada' or length(trim(coalesce(motivo, ''))) >= 5);

-- 4. El estado de cada OP de la app. Una línea bloqueada u observada frena toda la OP.
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
left join cc.imputaciones i on i.op_numero = o.numero and i.comprobante_id is not null and i.importe <> 0
left join app.v_aprobacion_linea l on l.op_numero = i.op_numero and l.comprobante_id = i.comprobante_id
group by o.numero, o.estado, a.enviada_en;
grant select on app.v_op_estado to app_compras;

-- 5. La base frena pagar una OP de la app que no esté Autorizada (reemplaza el control
--    de sql/007, que solo miraba los renglones).
create or replace function cc._controlar_pago_app() returns trigger language plpgsql as $$
declare v_estado text;
begin
  if new.estado = 'Pagada' and old.estado is distinct from 'Pagada' and new.origen = 'app' then
    select estado into v_estado from app.v_op_estado where op_numero = new.numero;
    if v_estado is distinct from 'Autorizada' then
      raise exception 'OP % está %: solo se paga una OP Autorizada', new.numero, coalesce(v_estado, 'sin estado');
    end if;
  end if;
  return new;
end $$;
