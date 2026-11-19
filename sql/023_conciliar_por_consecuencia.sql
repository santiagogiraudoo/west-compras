-- Conciliador en la base, por consecuencia (19/11, docs/proyecto/09_flujo_entrada.md).
-- Se aplica con el dueño de la base.
--
-- La cadena compra ↔ remito ↔ factura se arma sola en el momento en que algo cambia: entra o
-- se corrige un remito, una factura o una compra, la escriba la app, WhatsApp o el plomero.
-- No hay tareas programadas ni nada que atar a mano. Es la única fuente de las reglas de cruce.
--
-- Reglas (las del plomero, completar.py), de la más segura a la menos:
--   1. Factura sin remito ← remitos sueltos del proveedor que:
--      a. citan la factura (números que leyó el Buzón en el remito), o
--      b. la factura cita (números en su descripción), o
--      c. uno solo con el mismo importe (menos de $1) y fecha a 10 días o menos, o
--      d. varios que suman el total exacto (en centavos), de hasta 60 días antes.
--      c y d no adivinan: si otra factura abierta del proveedor tiene el mismo total, no se ata.
--   2. Remito sin compra (desde el corte, cuando empezaron las compras) → la compra abierta del
--      proveedor que el remito cita, o la única con el mismo importe de hasta 60 días antes; si
--      no hay, el remito crea su compra ("la compra entra con el remito o la confirmación").

-- Auxiliares ------------------------------------------------------------------------
-- La base del número: "0003-00045093-A" y "00003-00045093" → "3-45093" (sql/020).
create or replace function cc._clave_base(t text) returns text
language sql immutable parallel safe as $$ select split_part(cc._clave_comprobante(t), '|', 1) $$;

-- Los números PV-NRO que aparecen en un texto libre ("Remito RE 0001-00011778", "X0000100013385").
create or replace function cc._numeros_en(t text) returns setof text
language sql immutable parallel safe as $$
  select m[1] || '-' || m[2] from regexp_matches(coalesce(t, ''), '(\d{1,5})\s*-\s*(\d{1,8})', 'g') m
  union
  select m[1] || '-' || m[2] from regexp_matches(coalesce(t, ''), '(?<!\d)(\d{5})(\d{8})(?!\d)', 'g') m
$$;

-- Lo que un remito cita (facturas, pedidos), según lo que leyó el Buzón.
create or replace function cc._citas_remito(p_remito bigint) returns setof text
language sql stable as $$
  select x from app.entrada e, jsonb_array_elements_text(coalesce(e.lectura->'remito'->'facturas_citadas', '[]')) x
  where e.remito_id = p_remito
$$;

-- Remitos sueltos que suman exacto un total (en centavos), de hasta 60 días antes de la fecha.
-- Prefiere la combinación más larga (la cuenta entera); a lo sumo 15 remitos.
create or replace function cc._remitos_que_suman(p text, p_fecha date, p_total numeric) returns bigint[]
language sql stable as $$
  with recursive c as (
    select row_number() over (order by r.fecha, r.id) as i, r.id, round(r.importe * 100)::bigint as v
    from (select * from cc.remitos r
          where r.proveedor_codigo = p and r.comprobante_id is null and r.estado <> 'anulado'
            and r.importe > 0 and r.fecha <= p_fecha and r.fecha >= p_fecha - 60
          order by r.fecha, r.id limit 15) r
  ), s(ult, ids, suma) as (
    select i, array[id], v from c
    union all
    select c.i, s.ids || c.id, s.suma + c.v from s join c on c.i > s.ult
    where s.suma + c.v <= round(p_total * 100)
  )
  select ids from s where suma = round(p_total * 100) and cardinality(ids) > 1
  order by cardinality(ids) desc limit 1
$$;

-- El conciliador de un proveedor ---------------------------------------------------
create or replace function cc.conciliar_proveedor(p text) returns jsonb
language plpgsql as $$
declare
  v_desde date := coalesce(nullif(current_setting('app.conciliar_compras_desde', true), ''), '2026-11-01')::date;
  f record; rem record; cmp record; v_ids bigint[]; v_compra bigint; v_rem bigint; v_hecho jsonb := '[]';
begin
  if p is null then return v_hecho; end if;
  -- Dos cambios del mismo proveedor a la vez: el segundo espera y ve lo que hizo el primero.
  perform pg_advisory_xact_lock(hashtext('conciliar:' || p));

  -- 1. Facturas sin remito, de la más vieja a la más nueva.
  for f in
    select c.id, c.numero, c.fecha, c.total, c.descripcion from cc.comprobantes c
    where c.proveedor_codigo = p and c.tipo not ilike 'nota de%' and c.estado_aprobacion <> 'Anulado'
      and c.total > 0 and c.fecha >= current_date - 180
      and not exists (select 1 from cc.remitos x where x.comprobante_id = c.id and x.estado <> 'anulado')
    order by c.fecha, c.id
  loop
    -- a. los remitos que citan la factura
    select array_agg(r.id) into v_ids from cc.remitos r
    where r.proveedor_codigo = p and r.comprobante_id is null and r.estado <> 'anulado'
      and exists (select 1 from cc._citas_remito(r.id) x where cc._clave_base(x) = cc._clave_base(f.numero));
    -- b. los remitos que la factura cita
    if v_ids is null then
      select array_agg(r.id) into v_ids from cc.remitos r
      where r.proveedor_codigo = p and r.comprobante_id is null and r.estado <> 'anulado'
        and r.numero is not null and position('-' in cc._clave_base(r.numero)) > 0
        and exists (select 1 from cc._numeros_en(f.descripcion) x where cc._clave_base(x) = cc._clave_base(r.numero));
    end if;
    -- c y d: por monto, solo si ninguna otra factura abierta del proveedor tiene el mismo total
    if v_ids is null and not exists (
      select 1 from cc.comprobantes g
      where g.proveedor_codigo = p and g.id <> f.id and g.tipo not ilike 'nota de%' and g.estado_aprobacion <> 'Anulado'
        and abs(g.total - f.total) < 1 and g.fecha >= current_date - 180
        and not exists (select 1 from cc.remitos x where x.comprobante_id = g.id and x.estado <> 'anulado'))
    then
      select array_agg(q.id) into v_ids from (
        select r.id from cc.remitos r
        where r.proveedor_codigo = p and r.comprobante_id is null and r.estado <> 'anulado'
          and r.importe is not null and abs(r.importe - f.total) < 1 and abs(r.fecha - f.fecha) <= 10
      ) q having count(*) = 1;
      if v_ids is null then v_ids := cc._remitos_que_suman(p, f.fecha, f.total); end if;
    end if;
    if v_ids is not null then
      update cc.remitos set comprobante_id = f.id where id = any (v_ids) and comprobante_id is null;
      v_hecho := v_hecho || jsonb_build_object('factura', f.numero, 'remitos', to_jsonb(v_ids));
    end if;
    v_ids := null;
  end loop;

  -- 2. Remitos sin compra (desde el corte), del más viejo al más nuevo.
  for rem in
    select x.id, x.numero, x.fecha, x.importe, x.estado, x.autorizo, c.unidad_codigo as unidad
    from cc.remitos x left join cc.comprobantes c on c.id = x.comprobante_id
    where x.proveedor_codigo = p and x.compra_id is null and x.estado <> 'anulado' and x.fecha >= v_desde
    order by x.fecha, x.id
  loop
    -- la compra abierta que el remito cita
    select min(k.id) into v_compra from cc.compras k
    where k.proveedor_codigo = p and k.estado in ('pedido confirmado', 'esperando remito')
      and k.clickup_id not like 'app:remito-%'  -- una provisoria es de su remito: no recibe otros
      and exists (select 1 from cc._citas_remito(rem.id) x join cc._numeros_en(k.nombre) n on cc._clave_base(n) = cc._clave_base(x))
    having count(*) = 1;
    -- o la única abierta con el mismo importe, de hasta 60 días antes del remito
    if v_compra is null and rem.importe is not null then
      select min(k.id) into v_compra from cc.compras k
      where k.proveedor_codigo = p and k.estado in ('pedido confirmado', 'esperando remito')
        and k.clickup_id not like 'app:remito-%'  -- una provisoria es de su remito: no recibe otros
        and k.importe is not null and abs(k.importe - rem.importe) < 1 and k.fecha <= rem.fecha and k.fecha >= rem.fecha - 60
      having count(*) = 1;
    end if;
    if v_compra is not null then
      update cc.remitos set compra_id = v_compra where id = rem.id;
      -- Con su remito firmado por lo mismo que se compró, la compra queda entregada.
      update cc.compras set estado = case when rem.estado = 'ok' and importe is not null and rem.importe is not null
                                            and abs(importe - rem.importe) < 1 then 'hecho' else 'esperando remito' end,
                            actualizada_en = now()
      where id = v_compra and estado in ('pedido confirmado', 'esperando remito');
    else
      insert into cc.compras (clickup_id, nombre, proveedor_codigo, unidad_codigo, importe, estado, autorizo, fecha, origen)
      values ('app:remito-' || rem.id, 'Remito ' || coalesce(rem.numero, 's/n'), p, rem.unidad, rem.importe,
              case when rem.estado = 'ok' then 'hecho' else 'esperando remito' end, rem.autorizo, coalesce(rem.fecha, current_date), 'app')
      on conflict (clickup_id) do nothing
      returning id into v_compra;
      if v_compra is null then select id into v_compra from cc.compras where clickup_id = 'app:remito-' || rem.id; end if;
      update cc.remitos set compra_id = v_compra where id = rem.id;
    end if;
    v_hecho := v_hecho || jsonb_build_object('remito', rem.id, 'compra', v_compra);
    v_compra := null;
  end loop;

  -- 3. La compra que llega después que su remito: el remito ya había creado su compra provisoria
  --    ("app:remito-…"). Si el remito cita esta compra o es el único con su importe, pasa a la
  --    compra de verdad y la provisoria queda descartada: nunca dos compras para lo mismo.
  for cmp in
    select c.id, c.nombre, c.importe, c.fecha from cc.compras c
    where c.proveedor_codigo = p and c.estado in ('pedido confirmado', 'esperando remito')
      and c.clickup_id not like 'app:remito-%'
      and not exists (select 1 from cc.remitos x where x.compra_id = c.id)
    order by c.fecha, c.id
  loop
    select min(x.id) into v_rem from cc.remitos x
    join cc.compras a on a.id = x.compra_id and a.clickup_id = 'app:remito-' || x.id
    where x.proveedor_codigo = p and x.estado <> 'anulado'
      and (exists (select 1 from cc._citas_remito(x.id) ci join cc._numeros_en(cmp.nombre) n on cc._clave_base(n) = cc._clave_base(ci))
           or (x.importe is not null and cmp.importe is not null and abs(x.importe - cmp.importe) < 1
               and x.fecha >= cmp.fecha and x.fecha <= cmp.fecha + 60))
    having count(*) = 1;
    if v_rem is not null then
      update cc.remitos set compra_id = cmp.id where id = v_rem;
      update cc.compras set estado = 'descartado', actualizada_en = now() where clickup_id = 'app:remito-' || v_rem;
      update cc.compras set estado = case when (select estado from cc.remitos where id = v_rem) = 'ok' then 'hecho' else 'esperando remito' end,
        actualizada_en = now() where id = cmp.id;
      v_hecho := v_hecho || jsonb_build_object('remito', v_rem, 'compra', cmp.id, 'reemplaza_provisoria', true);
    end if;
    v_rem := null;
  end loop;
  return v_hecho;
end $$;

-- Los disparadores ------------------------------------------------------------------
-- Cada cambio concilia a su proveedor. Lo que escribe el propio conciliador no lo vuelve a
-- disparar (pg_trigger_depth): sin bucles.
create or replace function cc._conciliar_al_cambiar() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform cc.conciliar_proveedor(new.proveedor_codigo);
  return null;
end $$;

drop trigger if exists conciliar on cc.remitos;
create trigger conciliar after insert or update of comprobante_id, compra_id, importe, numero, fecha, estado
  on cc.remitos for each row execute function cc._conciliar_al_cambiar();

drop trigger if exists conciliar on cc.comprobantes;
create trigger conciliar after insert or update of total, estado_aprobacion, descripcion, numero, fecha
  on cc.comprobantes for each row execute function cc._conciliar_al_cambiar();

drop trigger if exists conciliar on cc.compras;
create trigger conciliar after insert or update of importe, estado, nombre, proveedor_codigo
  on cc.compras for each row execute function cc._conciliar_al_cambiar();

-- Lo que el Buzón leyó de un remito (lo que cita) se guarda después de cargarlo: también dispara.
create or replace function app._conciliar_entrada() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 or new.proveedor_codigo is null then return null; end if;
  perform cc.conciliar_proveedor(new.proveedor_codigo);
  return null;
end $$;
drop trigger if exists conciliar on app.entrada;
create trigger conciliar after update of remito_id, comprobante_id, compra_id on app.entrada
  for each row execute function app._conciliar_entrada();

-- Lo que ya estaba abierto antes de los disparadores se concilia una vez, al aplicar esto.
select cc.conciliar_proveedor(codigo) from cc.proveedores order by codigo;

insert into app.migraciones (archivo, huella) values ('023_conciliar_por_consecuencia.sql', null)
on conflict (archivo) do nothing;
