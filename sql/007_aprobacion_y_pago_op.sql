-- Fase 3: aprobación por línea de la OP y registro del pago (18/11).
-- Se aplica con el dueño de la base. Aplicado en dev-app-compras el 18/11.
--
-- 1. app.aprobaciones_op: cada decisión sobre una línea (factura imputada) de una OP.
--    Se agrega, nunca se pisa: vale la última de cada línea y queda la historia.
--    "Una línea observada frena toda la OP" (Adriano 17/11) se deriva en la vista.
-- 2. La base frena pagar una OP armada en la app con alguna línea sin aprobar.
--    Las de ClickUp (origen distinto de 'app') siguen su circuito de siempre.
-- 3. cc.cargar_pagos acepta "Comprobante (link)" para guardar el comprobante del pago.

create table if not exists app.aprobaciones_op (
  id             serial primary key,
  op_numero      text not null references cc.ordenes_pago(numero),
  comprobante_id bigint not null references cc.comprobantes(id),
  decision       text not null check (decision in ('Aprobada', 'Observada')),
  motivo         text,
  usuario_id     int not null references app.users(id),
  usuario        text not null,
  creado_en      timestamptz not null default now(),
  constraint observada_con_motivo check (decision = 'Aprobada' or length(trim(coalesce(motivo, ''))) >= 5)
);
create index if not exists aprobaciones_op_linea on app.aprobaciones_op (op_numero, comprobante_id, creado_en desc);

grant select, insert on app.aprobaciones_op to app_compras;
grant usage, select on sequence app.aprobaciones_op_id_seq to app_compras;

-- La última decisión de cada línea.
create or replace view app.v_aprobacion_linea as
select distinct on (op_numero, comprobante_id)
  op_numero, comprobante_id, decision, motivo, usuario, creado_en
from app.aprobaciones_op
order by op_numero, comprobante_id, creado_en desc, id desc;

grant select on app.v_aprobacion_linea to app_compras;

create or replace function cc._controlar_pago_app() returns trigger language plpgsql as $$
declare v_faltan int;
begin
  if new.estado = 'Pagada' and old.estado is distinct from 'Pagada' and new.origen = 'app' then
    select count(*) into v_faltan
    from cc.imputaciones i
    left join app.v_aprobacion_linea a on a.op_numero = i.op_numero and a.comprobante_id = i.comprobante_id
    where i.op_numero = new.numero and i.comprobante_id is not null and i.importe <> 0
      and a.decision is distinct from 'Aprobada';
    if v_faltan > 0 then
      raise exception 'OP %: % línea(s) sin aprobar, no se puede pagar', new.numero, v_faltan;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pago_app_aprobado on cc.ordenes_pago;
create trigger pago_app_aprobado before update of estado on cc.ordenes_pago
  for each row execute function cc._controlar_pago_app();

-- cargar_pagos: igual que antes, más "Comprobante (link)" → comprobante_link.
CREATE OR REPLACE FUNCTION cc.cargar_pagos(p jsonb, p_origen text DEFAULT 'claude'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  r jsonb; v_op text; v_prov text; v_clave text; found_dup boolean; v_num text; v_id bigint; v_corregir boolean;
  n_op int := 0; n_imp int := 0; n_corr int := 0; n_dup int := 0;
  errores jsonb := '[]'; ops_fallidas text[] := '{}'; v_dif numeric;
  v_tit_txt text; v_tit text;
begin
  for r in select * from jsonb_array_elements(coalesce(p->'ordenes', '[]')) loop
    begin
      v_op := cc._txt(r->'N° OP');
      v_prov := cc._codigo(r->>'Proveedor (elegir)');
      if v_op is null then raise exception 'Falta N° OP'; end if;
      v_prov := coalesce(v_prov, (select proveedor_codigo from cc.ordenes_pago where numero = v_op));
      if v_prov is null then raise exception 'OP % nueva sin proveedor', v_op; end if;
      if not exists (select 1 from cc.proveedores where codigo = v_prov) then
        raise exception 'Proveedor % no está dado de alta', v_prov;
      end if;
      v_tit_txt := coalesce(cc._txt(r->'Titular'), cc._txt(r->'Facturado a (elegir)'));
      v_tit := cc._titular(v_tit_txt);
      if v_tit_txt is not null and v_tit is null then
        raise exception 'Titular "%" no está en la lista de titulares', v_tit_txt;
      end if;
      insert into cc.ordenes_pago as t (numero, fecha_op, fecha_salida_caja, proveedor_codigo,
        medio_pago, estado, total_imputado, ret_ganancias, ret_iva, ret_iibb, ret_suss,
        otras_ret, neto_transferir, referencia_bancaria, origen, titular, comprobante_link)
      values (v_op, coalesce(cc._fecha(r->'Fecha OP'), current_date), cc._fecha(r->'Fecha salida de caja'),
        v_prov, cc._txt(r->'Medio de pago'), coalesce(cc._txt(r->'Estado'), 'Prevista'),
        coalesce(cc._num(r->'Total imputado'), 0), coalesce(cc._num(r->'Ret. Ganancias'), 0),
        coalesce(cc._num(r->'Ret. IVA'), 0), coalesce(cc._num(r->'Ret. IIBB'), 0),
        coalesce(cc._num(r->'Ret. SUSS'), 0), coalesce(cc._num(r->'Otras ret.'), 0),
        cc._num(r->'Neto a transferir'), cc._txt(r->'Referencia bancaria'), p_origen, v_tit,
        cc._txt(r->'Comprobante (link)'))
      on conflict (numero) do update set
        fecha_op            = coalesce(cc._fecha(r->'Fecha OP'), t.fecha_op),
        fecha_salida_caja   = coalesce(excluded.fecha_salida_caja, t.fecha_salida_caja),
        proveedor_codigo    = coalesce(excluded.proveedor_codigo, t.proveedor_codigo),
        medio_pago          = coalesce(excluded.medio_pago, t.medio_pago),
        estado              = coalesce(cc._txt(r->'Estado'), t.estado),
        total_imputado      = coalesce(cc._num(r->'Total imputado'), t.total_imputado),
        ret_ganancias       = coalesce(cc._num(r->'Ret. Ganancias'), t.ret_ganancias),
        ret_iva             = coalesce(cc._num(r->'Ret. IVA'), t.ret_iva),
        ret_iibb            = coalesce(cc._num(r->'Ret. IIBB'), t.ret_iibb),
        ret_suss            = coalesce(cc._num(r->'Ret. SUSS'), t.ret_suss),
        otras_ret           = coalesce(cc._num(r->'Otras ret.'), t.otras_ret),
        neto_transferir     = coalesce(excluded.neto_transferir, t.neto_transferir),
        referencia_bancaria = coalesce(excluded.referencia_bancaria, t.referencia_bancaria),
        titular             = coalesce(excluded.titular, t.titular),
        comprobante_link    = coalesce(excluded.comprobante_link, t.comprobante_link);
      select total_imputado - coalesce(total_retenciones, 0) - neto_transferir into v_dif
      from cc.ordenes_pago where numero = v_op;
      if v_dif is not null and abs(v_dif) >= 1 then
        raise exception 'OP % no cuadra: total − retenciones − neto = $%', v_op, cc._monto(v_dif);
      end if;
      delete from cc.reservas_op where numero = v_op;
      n_op := n_op + 1;
    exception when others then
      errores := errores || jsonb_build_object('op', v_op, 'error', sqlerrm);
      ops_fallidas := ops_fallidas || v_op;
    end;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'imputaciones', '[]')) loop
    begin
      v_op := cc._txt(r->'N° OP');
      v_clave := cc._txt(r->'Comprobante (clave)');
      v_prov := trim(split_part(v_clave, '|', 1));
      v_num := trim(substr(v_clave, strpos(v_clave, '|') + 1));
      v_corregir := upper(coalesce(r->>'Corregir', '')) = 'SI';
      if v_op = any (ops_fallidas) then
        raise exception 'No se imputa: la OP % no se grabó', v_op;
      end if;
      if not exists (select 1 from cc.ordenes_pago where numero = v_op) then
        raise exception 'La OP % no existe', v_op;
      end if;
      if upper(v_clave) = 'A CUENTA' then
        update cc.ordenes_pago o set titular = x.tit
        from (select min(c.facturado_a) tit from cc.comprobantes c
              where c.proveedor_codigo = (select proveedor_codigo from cc.ordenes_pago where numero = v_op)
                and c.facturado_a is not null
              having count(distinct c.facturado_a) = 1) x
        where o.numero = v_op and o.titular is null and x.tit is not null;
        if exists (select 1 from cc.imputaciones where op_numero = v_op and comprobante_id is null
                   and importe = cc._num(r->'Importe imputado')) then
          n_dup := n_dup + 1;
        else
          insert into cc.imputaciones (op_numero, comprobante_id, importe)
          values (v_op, null, cc._num(r->'Importe imputado'));
          n_imp := n_imp + 1;
        end if;
        continue;
      end if;
      select id into v_id from cc.comprobantes where proveedor_codigo = v_prov and numero = v_num;
      if v_id is null then raise exception 'Comprobante % no encontrado', v_clave; end if;
      found_dup := exists (select 1 from cc.imputaciones where op_numero = v_op and comprobante_id = v_id);
      if found_dup then
        if v_corregir then
          update cc.imputaciones set importe = cc._num(r->'Importe imputado')
          where op_numero = v_op and comprobante_id = v_id;
          n_corr := n_corr + 1;
        else
          n_dup := n_dup + 1;
        end if;
      else
        insert into cc.imputaciones (op_numero, comprobante_id, importe)
        values (v_op, v_id, cc._num(r->'Importe imputado'));
      end if;
      if (select abs(coalesce(sum(i.importe), 0)) - abs(max(c.total))
          from cc.comprobantes c left join cc.imputaciones i on i.comprobante_id = c.id
          where c.id = v_id) > 1 then
        raise exception 'Se le imputaría a % más que su total (posible doble pago)', v_clave;
      end if;
      if not found_dup then n_imp := n_imp + 1; end if;
    exception when others then
      errores := errores || jsonb_build_object('imputacion', v_op || ' / ' || coalesce(v_clave, '?'), 'error', sqlerrm);
    end;
  end loop;
  r := jsonb_build_object('ordenes', n_op, 'imputaciones', n_imp, 'corregidas', n_corr,
         'duplicadas', n_dup, 'errores', errores);
  insert into cc.log_cargas (accion, detalle, resultado)
  values ('pagos', r, case when jsonb_array_length(errores) = 0 then 'ok' else 'error' end);
  return r;
end $function$;
