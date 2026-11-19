-- Leer la compra desde la descripción de la tarea de ClickUp (18/11). La suscripción de
-- ClickUp no deja hacer obligatorios los campos, así que los datos van en un bloque fijo
-- al principio de la descripción (estándar en docs/proyecto/05_ordenes_de_compra.md):
--
--   Unidad: UN-03
--   Proveedor: Defer
--   Total con IVA: $1.234.567,89
--   Para qué: arreglo del techo por filtraciones
--   Pidió: Santi Demattia
--   Autorizó: Santiago López Demattia
--
-- La regla de lectura vive en la base (no en el plomero ni en la app), así todos leen
-- igual. cargar_compras usa lo que venga explícito y completa lo que falte con la
-- descripción. El campo Proveedor de ClickUp, si está, gana (cc.proveedores.clickup_ficha_id).
-- Se aplica con scripts/aplicar-sql.ts.

-- Monto escrito a la argentina: "$36.900" = 36900; "$1.234,50" = 1234.50.
create or replace function cc._monto_ar(t text) returns numeric language plpgsql immutable as $$
declare s text := regexp_replace(coalesce(t, ''), '[^0-9.,]', '', 'g');
begin
  if s = '' then return null; end if;
  if s like '%,%' then return replace(replace(s, '.', ''), ',', '.')::numeric; end if;
  if s ~ '^\d{1,3}(\.\d{3})+$' then return replace(s, '.', '')::numeric; end if;
  return s::numeric;
end $$;

-- El bloque de la descripción como jsonb con las claves de cargar_compras. Tolera
-- negritas, viñetas y mayúsculas: "**Total con IVA:** $1.000" sirve.
create or replace function cc._leer_compra(texto text) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(clave, valor), '{}')
  from (
    select distinct on (clave) clave, valor from (
      select case lower(translate(m[1], 'áéíóú', 'aeiou'))
               when 'unidad' then 'Unidad' when 'proveedor' then 'Proveedor (elegir)'
               when 'total con iva' then 'Importe' when 'total' then 'Importe'
               when 'para que' then 'Para qué' when 'pidio' then 'Pidió' when 'autorizo' then 'Autorizó'
             end as clave,
             nullif(trim(m[2]), '') as valor, n
      from regexp_matches(coalesce(texto, ''),
             '^[\s*•\-]*(Unidad|Proveedor|Total con IVA|Total|Para qu[eé]|Pidi[oó]|Autoriz[oó])\s*\**\s*:\s*\**\s*(.*?)\s*\**\s*$',
             'gimn') with ordinality as x(m, n)) l
    where valor is not null
    order by clave, n) p
$$;

-- Proveedor por código ("PR-004"), por la ficha de ClickUp o por razón social exacta.
create or replace function cc._proveedor_compra(t text, ficha text) returns text language sql stable as $$
  select coalesce(
    (select codigo from cc.proveedores where clickup_ficha_id = ficha),
    (select codigo from cc.proveedores where codigo = cc._codigo(t)),
    (select min(codigo) from cc.proveedores where lower(razon_social) = lower(trim(t)) having count(*) = 1))
$$;

-- Unidad por código ("UN-03", "UN-03 · ISELIN 90") o por nombre exacto.
create or replace function cc._unidad_compra(t text) returns text language sql stable as $$
  select coalesce(
    (select codigo from cc.unidades where codigo = upper(cc._codigo(t))),
    (select codigo from cc.unidades where codigo = upper(substring(t from '(?i)UN-\d+'))),
    (select min(codigo) from cc.unidades where lower(nombre) = lower(trim(t)) having count(*) = 1))
$$;

-- Igual que en sql/017, más: "Descripción" (se lee el bloque y completa lo que falte),
-- "Proveedor (ClickUp id)" (el campo Proveedor de la tarea) y "Creador" (si no dice
-- Pidió). Un proveedor o una unidad escritos que no se reconocen frenan la compra.
create or replace function cc.cargar_compras(p jsonb, p_origen text default 'plomero')
 returns jsonb language plpgsql as $$
declare
  r jsonb; v_id bigint; v_clickup text; v_prov text; v_uni text; v_rem bigint; v_otra bigint;
  v_prov_txt text; v_uni_txt text; v_imp text;
  n int := 0; n_rem int := 0; errores jsonb := '[]';
begin
  for r in select * from jsonb_array_elements(coalesce(p->'compras', '[]')) loop
    begin
      v_clickup := cc._txt(r->'ClickUp id');
      if v_clickup is null then raise exception 'Falta ClickUp id'; end if;
      -- Lo explícito gana; lo que falta sale de la descripción.
      r := cc._leer_compra(r->>'Descripción') || jsonb_strip_nulls(r);
      if cc._txt(r->'Pidió') is null and cc._txt(r->'Creador') is not null then
        r := r || jsonb_build_object('Pidió', r->'Creador');
      end if;
      v_prov_txt := cc._txt(r->'Proveedor (elegir)');
      v_uni_txt := cc._txt(r->'Unidad');
      v_prov := cc._proveedor_compra(v_prov_txt, cc._txt(r->'Proveedor (ClickUp id)'));
      v_uni := cc._unidad_compra(v_uni_txt);
      if v_prov is null and (v_prov_txt is not null or cc._txt(r->'Proveedor (ClickUp id)') is not null) then
        raise exception 'Proveedor "%" no está dado de alta', coalesce(v_prov_txt, r->>'Proveedor (ClickUp id)');
      end if;
      if v_uni is null and v_uni_txt is not null then raise exception 'Unidad "%" no existe', v_uni_txt; end if;
      v_imp := r->>'Importe';
      insert into cc.compras as t (clickup_id, nombre, proveedor_codigo, unidad_codigo, importe, para_que,
        estado, pidio, autorizo, fecha, origen)
      values (v_clickup, coalesce(cc._txt(r->'Nombre'), v_clickup), v_prov, v_uni,
        case when jsonb_typeof(r->'Importe') = 'number' then (r->>'Importe')::numeric else cc._monto_ar(v_imp) end,
        cc._txt(r->'Para qué'), coalesce(lower(cc._txt(r->'Estado')), 'pedido confirmado'),
        cc._txt(r->'Pidió'), cc._txt(r->'Autorizó'), coalesce(cc._fecha(r->'Fecha'), current_date), p_origen)
      on conflict (clickup_id) do update set
        nombre           = coalesce(cc._txt(r->'Nombre'), t.nombre),
        proveedor_codigo = coalesce(excluded.proveedor_codigo, t.proveedor_codigo),
        unidad_codigo    = coalesce(excluded.unidad_codigo, t.unidad_codigo),
        importe          = coalesce(excluded.importe, t.importe),
        para_que         = coalesce(excluded.para_que, t.para_que),
        estado           = coalesce(lower(cc._txt(r->'Estado')), t.estado),
        pidio            = coalesce(excluded.pidio, t.pidio),
        autorizo         = coalesce(excluded.autorizo, t.autorizo),
        fecha            = coalesce(cc._fecha(r->'Fecha'), t.fecha),
        actualizada_en   = now()
      returning id into v_id;
      for v_rem in select (x #>> '{}')::bigint from jsonb_array_elements(coalesce(r->'Remitos', '[]')) x loop
        select compra_id into v_otra from cc.remitos where id = v_rem;
        if not found then raise exception 'Remito % no existe', v_rem; end if;
        if v_otra is not null and v_otra <> v_id then
          raise exception 'El remito % ya es de otra compra (%)', v_rem, (select clickup_id from cc.compras where id = v_otra);
        end if;
        if v_otra is null then
          update cc.remitos set compra_id = v_id where id = v_rem;
          n_rem := n_rem + 1;
        end if;
      end loop;
      n := n + 1;
    exception when others then
      errores := errores || jsonb_build_object('compra', coalesce(v_clickup, '?'), 'error', sqlerrm);
    end;
  end loop;
  r := jsonb_build_object('compras', n, 'remitos', n_rem, 'errores', errores);
  insert into cc.log_cargas (accion, detalle, resultado)
  values ('compras', r, case when jsonb_array_length(errores) = 0 then 'ok' else 'error' end);
  return r;
end $$;
grant execute on function cc.cargar_compras(jsonb, text) to app_compras;
