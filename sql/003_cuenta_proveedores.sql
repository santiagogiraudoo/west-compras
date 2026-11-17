-- Cuenta bancaria del proveedor en campos (17/11). Antes era un solo texto libre en
-- cc.proveedores.cbu_alias ("CBU … · alias … · banco · titular … · fuente") y el
-- validador de la app rechazaba ese texto al editar un proveedor.
--
-- cbu_alias se queda: lo leen cc.v_alertas ("Falta CBU"), el plomero y las OP de
-- ClickUp. La app lo vuelve a escribir armado desde los campos cuando cambian.
-- Los datos de hoy se separan en sql/004_cuenta_proveedores_datos.sql.
-- Se aplica con el dueño de la base. En dev-app-compras aplicado el 17/11.

alter table cc.proveedores
  add column if not exists cbu            text,
  add column if not exists alias          text,
  add column if not exists banco          text,
  add column if not exists cuenta_titular text;

comment on column cc.proveedores.cbu is 'CBU o CVU, 22 dígitos';
comment on column cc.proveedores.alias is 'Alias de la cuenta, en mayúsculas';
comment on column cc.proveedores.banco is 'Banco o billetera (sale del código del CBU)';
comment on column cc.proveedores.cuenta_titular is 'A nombre de quién está la cuenta (puede no ser el proveedor)';

-- cargar_nuevos: igual que antes, más las claves "CBU", "Alias", "Banco" y
-- "Titular cuenta". Quien no las manda (el plomero hoy) no cambia nada.
create or replace function cc.cargar_nuevos(p jsonb, p_origen text default 'claude'::text)
 returns jsonb
 language plpgsql
as $function$
declare
  comps jsonb; provs jsonb; r jsonb;
  v_prov text; v_un text; v_num text; v_id bigint; v_corregir boolean;
  n_prov int := 0; n_ok int := 0; n_corr int := 0; n_dup int := 0;
  errores jsonb := '[]'; duplicados jsonb := '[]';
begin
  if jsonb_typeof(p) = 'array' then
    comps := p; provs := '[]';
  else
    comps := coalesce(p->'comprobantes', '[]');
    provs := coalesce(p->'proveedores', '[]');
  end if;

  for r in select * from jsonb_array_elements(provs) loop
    begin
      insert into cc.proveedores as t (codigo, razon_social, cuit, condicion_iva, rubro,
        condicion_pago, plazo_dias, medio_pago_habitual, cbu_alias, contacto, email,
        telefono, limite_credito, observaciones, activo, cbu, alias, banco, cuenta_titular)
      values (cc._codigo(r->>'Codigo'),
              coalesce(cc._txt(r->'Razon social'), cc._txt(r->'Razón social')),
              cc._txt(r->'CUIT'), cc._txt(r->'Cond. IVA'), cc._txt(r->'Rubro principal'),
              cc._txt(r->'Condicion de pago'), cc._num(r->'Plazo (dias)')::int,
              cc._txt(r->'Medio de pago habitual'), cc._txt(r->'CBU / Alias'),
              cc._txt(r->'Contacto'), cc._txt(r->'Email'), cc._txt(r->'Telefono'),
              cc._num(r->'Limite de credito'), cc._txt(r->'Observaciones'),
              coalesce(cc._txt(r->'Estado'), 'Activo') <> 'Inactivo',
              cc._txt(r->'CBU'), cc._txt(r->'Alias'), cc._txt(r->'Banco'), cc._txt(r->'Titular cuenta'))
      on conflict (codigo) do update set
        razon_social        = coalesce(excluded.razon_social, t.razon_social),
        cuit                = coalesce(excluded.cuit, t.cuit),
        condicion_iva       = coalesce(excluded.condicion_iva, t.condicion_iva),
        rubro               = coalesce(excluded.rubro, t.rubro),
        condicion_pago      = coalesce(excluded.condicion_pago, t.condicion_pago),
        plazo_dias          = coalesce(excluded.plazo_dias, t.plazo_dias),
        medio_pago_habitual = coalesce(excluded.medio_pago_habitual, t.medio_pago_habitual),
        cbu_alias           = coalesce(excluded.cbu_alias, t.cbu_alias),
        contacto            = coalesce(excluded.contacto, t.contacto),
        email               = coalesce(excluded.email, t.email),
        telefono            = coalesce(excluded.telefono, t.telefono),
        limite_credito      = coalesce(excluded.limite_credito, t.limite_credito),
        observaciones       = coalesce(excluded.observaciones, t.observaciones),
        cbu                 = coalesce(excluded.cbu, t.cbu),
        alias               = coalesce(excluded.alias, t.alias),
        banco               = coalesce(excluded.banco, t.banco),
        cuenta_titular      = coalesce(excluded.cuenta_titular, t.cuenta_titular);
      n_prov := n_prov + 1;
    exception when others then
      errores := errores || jsonb_build_object('proveedor', r->>'Codigo', 'error', sqlerrm);
    end;
  end loop;

  for r in select * from jsonb_array_elements(comps) loop
    begin
      v_prov := cc._codigo(r->>'Proveedor (elegir)');
      v_num  := cc._txt(r->'N° comprobante');
      v_un   := cc._codigo(r->>'Unidad de negocio (elegir)');
      v_corregir := upper(coalesce(r->>'Corregir', '')) = 'SI';

      if v_prov is null or v_num is null then
        raise exception 'Falta proveedor o número de comprobante';
      end if;
      if not exists (select 1 from cc.proveedores where codigo = v_prov) then
        raise exception 'Proveedor % no está dado de alta', v_prov;
      end if;
      if v_un is not null then
        insert into cc.unidades (codigo, nombre)
        values (v_un, coalesce(cc._nombre(r->>'Unidad de negocio (elegir)'), v_un))
        on conflict (codigo) do nothing;
      end if;

      select id into v_id from cc.comprobantes where proveedor_codigo = v_prov and numero = v_num;

      if v_id is not null and not v_corregir then
        n_dup := n_dup + 1;
        duplicados := duplicados || to_jsonb(v_prov || ' | ' || v_num);
        continue;
      end if;

      if v_id is null then
        insert into cc.comprobantes (proveedor_codigo, unidad_codigo, facturado_a, tipo, numero,
          fecha, rubro, descripcion, neto, iva, percepciones, total, estado_aprobacion,
          aprobado_por, plazo_dias, vencimiento, archivo_link, origen)
        values (v_prov, v_un, cc._txt(r->'Facturado a (elegir)'),
          coalesce(cc._txt(r->'Tipo'), 'FA'), v_num, cc._fecha(r->'Fecha'),
          cc._txt(r->'Rubro'), coalesce(cc._txt(r->'Descripcion'), cc._txt(r->'Descripción')),
          coalesce(cc._num(r->'Neto'), 0), coalesce(cc._num(r->'IVA'), 0),
          coalesce(cc._num(r->'Percepciones / otros'), 0), cc._num(r->'Total'),
          cc._txt(r->'Estado aprobacion'), cc._txt(r->'Aprobado por'),
          cc._num(r->'Plazo (dias)')::int, cc._fecha(r->'Vencimiento'),
          cc._txt(r->'Archivo / link'), p_origen);
        n_ok := n_ok + 1;
      else
        update cc.comprobantes set
          unidad_codigo     = coalesce(v_un, unidad_codigo),
          facturado_a       = coalesce(cc._txt(r->'Facturado a (elegir)'), facturado_a),
          tipo              = coalesce(cc._txt(r->'Tipo'), tipo),
          fecha             = coalesce(cc._fecha(r->'Fecha'), fecha),
          rubro             = coalesce(cc._txt(r->'Rubro'), rubro),
          descripcion       = coalesce(cc._txt(r->'Descripcion'), descripcion),
          neto              = coalesce(cc._num(r->'Neto'), neto),
          iva               = coalesce(cc._num(r->'IVA'), iva),
          percepciones      = coalesce(cc._num(r->'Percepciones / otros'), percepciones),
          total             = coalesce(cc._num(r->'Total'), total),
          estado_aprobacion = coalesce(cc._txt(r->'Estado aprobacion'), estado_aprobacion),
          aprobado_por      = coalesce(cc._txt(r->'Aprobado por'), aprobado_por),
          plazo_dias        = coalesce(cc._num(r->'Plazo (dias)')::int, plazo_dias),
          vencimiento       = coalesce(cc._fecha(r->'Vencimiento'), vencimiento),
          archivo_link      = coalesce(cc._txt(r->'Archivo / link'), archivo_link)
        where id = v_id;
        n_corr := n_corr + 1;
      end if;
    exception when others then
      errores := errores || jsonb_build_object(
        'comprobante', coalesce(v_prov, '?') || ' | ' || coalesce(v_num, '?'), 'error', sqlerrm);
    end;
  end loop;

  r := jsonb_build_object('proveedores', n_prov, 'cargados', n_ok, 'corregidos', n_corr,
         'duplicados', n_dup, 'lista_duplicados', duplicados, 'errores', errores);
  insert into cc.log_cargas (accion, detalle, resultado, mensaje)
  values ('nuevos', r, case when jsonb_array_length(errores) = 0 then 'ok' else 'error' end, null);
  return r;
end $function$;
