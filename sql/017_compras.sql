-- Compras (fase 4, base; 18/11). La orden de compra sigue en ClickUp (lista Compras):
-- la compra entra a la base desde "pedido confirmado" y queda cerrada en "hecho", que es
-- cuando llegó el remito (Adriano 18/11). Ver docs/proyecto/05_ordenes_de_compra.md.
--
-- - cc.compras: registro mínimo de cada tarea de Compras. La escribe el plomero con
--   cc.cargar_compras, como facturas y pagos: la base frena lo que no cierra.
-- - El importe es siempre el total con IVA (Adriano 18/11): el IVA lo ve Candela y el
--   plomero con su Excel.
-- - La compra se cuelga del remito (cc.remitos.compra_id): una compra, varias entregas.
--   La factura de la compra no se guarda: se deriva por los remitos.
-- - app.v_compras: lo facturado y el saldo de cada compra, y lo que le falta cargar.
-- Se aplica con scripts/aplicar-sql.ts.

create table if not exists cc.compras (
  id               bigserial primary key,
  clickup_id       text not null unique,
  nombre           text not null,
  proveedor_codigo text references cc.proveedores(codigo),
  unidad_codigo    text references cc.unidades(codigo),
  importe          numeric check (importe >= 0),          -- total con IVA
  para_que         text,
  estado           text not null check (estado in ('pedido confirmado', 'esperando remito', 'hecho', 'descartado')),
  pidio            text,                                   -- quien la pidió
  autorizo         text,                                   -- quien la pidió o el encargado de la unidad
  fecha            date not null default current_date,     -- confirmación del pedido
  origen           text not null default 'plomero',
  creada_en        timestamptz not null default now(),
  actualizada_en   timestamptz not null default now()
);
grant select on cc.compras to app_compras;

alter table cc.remitos add column if not exists compra_id bigint references cc.compras(id);
create index if not exists remitos_por_compra on cc.remitos (compra_id) where compra_id is not null;

-- Carga desde ClickUp. Claves en castellano, como cargar_nuevos y cargar_pagos:
-- "ClickUp id", "Nombre", "Proveedor (elegir)", "Unidad", "Importe", "Para qué", "Estado",
-- "Pidió", "Autorizó", "Fecha" y "Remitos" (ids de cc.remitos que son de esta compra).
-- Vuelve a cargar la misma tarea = la actualiza; lo que no viene no se pisa.
create or replace function cc.cargar_compras(p jsonb, p_origen text default 'plomero')
 returns jsonb language plpgsql as $$
declare
  r jsonb; v_id bigint; v_clickup text; v_prov text; v_uni text; v_rem bigint; v_otra bigint;
  n int := 0; n_rem int := 0; errores jsonb := '[]';
begin
  for r in select * from jsonb_array_elements(coalesce(p->'compras', '[]')) loop
    begin
      v_clickup := cc._txt(r->'ClickUp id');
      if v_clickup is null then raise exception 'Falta ClickUp id'; end if;
      v_prov := cc._codigo(r->>'Proveedor (elegir)');
      v_uni := cc._codigo(r->>'Unidad');
      if v_prov is not null and not exists (select 1 from cc.proveedores where codigo = v_prov) then
        raise exception 'Proveedor % no está dado de alta', v_prov;
      end if;
      if v_uni is not null and not exists (select 1 from cc.unidades where codigo = v_uni) then
        raise exception 'Unidad % no existe', v_uni;
      end if;
      insert into cc.compras as t (clickup_id, nombre, proveedor_codigo, unidad_codigo, importe, para_que,
        estado, pidio, autorizo, fecha, origen)
      values (v_clickup, coalesce(cc._txt(r->'Nombre'), v_clickup), v_prov, v_uni, cc._num(r->'Importe'),
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

-- Cada compra con lo facturado (facturas de sus remitos firmados, una vez cada una) y
-- el saldo. "falta" dice qué le falta cargar en ClickUp para poder cruzarla.
create or replace view app.v_compras as
with fac as (
  select distinct r.compra_id, c.id, c.total
  from cc.remitos r join cc.comprobantes c on c.id = r.comprobante_id
  where r.compra_id is not null and r.estado = 'ok' and c.estado_aprobacion <> 'Anulado'),
rem as (
  select compra_id, count(*) filter (where estado = 'ok') firmados, count(*) filter (where estado = 'falta') sin_firmar
  from cc.remitos where compra_id is not null group by compra_id)
select k.id, k.clickup_id, k.nombre, k.proveedor_codigo, k.unidad_codigo, k.importe, k.para_que, k.estado,
  k.pidio, k.autorizo, k.fecha,
  coalesce(rem.firmados, 0) as remitos_firmados, coalesce(rem.sin_firmar, 0) as remitos_sin_firmar,
  coalesce((select sum(total) from fac where fac.compra_id = k.id), 0) as facturado,
  k.importe - coalesce((select sum(total) from fac where fac.compra_id = k.id), 0) as saldo,
  nullif(concat_ws(', ',
    case when k.proveedor_codigo is null then 'proveedor' end,
    case when k.unidad_codigo is null then 'unidad' end,
    case when k.importe is null then 'importe' end,
    case when k.autorizo is null then 'quién autorizó' end), '') as falta
from cc.compras k left join rem on rem.compra_id = k.id;
grant select on app.v_compras to app_compras;
