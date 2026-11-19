-- Buzón de entrada y carga de remitos (19/11, docs/proyecto/09_flujo_entrada.md).
-- Se aplica con el dueño de la base.
--
-- 1. app.entrada: todo archivo que llega (app, WhatsApp, mail), uno por fila, con lo que se
--    leyó y lo que se hizo. El sha256 es único: el mismo archivo por dos canales se procesa
--    una vez. El id del mensaje de WhatsApp también: el reintento del webhook no duplica.
-- 2. cc.cargar_remitos: la app carga remitos pasando por la base (como cargar_nuevos con las
--    facturas): proveedor dado de alta, estado válido y sin repetir el número (misma clave
--    que los comprobantes, cc._clave_comprobante de sql/020).
-- 3. cc.ligar_remito: ata un remito a su factura, solo si es del mismo proveedor y el remito
--    no estaba ya atado a otra.

-- 1 -------------------------------------------------------------------------------
create table if not exists app.entrada (
  id               bigint generated always as identity primary key,
  sha256           text not null unique,
  canal            text not null check (canal in ('app', 'whatsapp', 'mail')),
  externo_id       text,          -- id del mensaje de WhatsApp o del mail
  remitente        text,          -- teléfono 549…, mail o usuario de la app
  remitente_nombre text,
  mensaje          text,          -- lo que acompañó al archivo ("es para West Club")
  nombre           text not null,
  tipo             text not null check (tipo in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  archivo          bytea not null check (octet_length(archivo) <= 10 * 1024 * 1024),
  estado           text not null default 'recibido'
                   check (estado in ('recibido', 'leido', 'procesado', 'revisar', 'duplicado', 'descartado')),
  clase            text check (clase in ('factura', 'nota_credito', 'nota_debito', 'remito', 'comprobante_pago', 'otro')),
  lectura          jsonb,
  resultado        jsonb,
  motivo           text,          -- por qué quedó a revisar, duplicado o descartado
  proveedor_codigo text references cc.proveedores(codigo),
  comprobante_id   bigint references cc.comprobantes(id),
  remito_id        bigint references cc.remitos(id),
  recibido_en      timestamptz not null default now(),
  procesado_en     timestamptz,
  constraint entrada_motivo check (estado not in ('revisar', 'duplicado', 'descartado') or length(btrim(coalesce(motivo, ''))) >= 3)
);
create unique index if not exists entrada_externo on app.entrada (canal, externo_id) where externo_id is not null;
create index if not exists entrada_estado on app.entrada (estado, recibido_en desc);
grant select, insert, update on app.entrada to app_compras;

-- 2 -------------------------------------------------------------------------------
create or replace function cc.cargar_remitos(p jsonb, p_origen text default 'app') returns jsonb
language plpgsql as $$
declare
  r jsonb; v_prov text; v_num text; v_estado text; v_id bigint; v_comp bigint;
  ids jsonb := '[]'; errores jsonb := '[]'; n_ok int := 0; n_dup int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p->'remitos', '[]')) loop
    begin
      v_prov := cc._codigo(r->>'proveedor');
      v_num := nullif(btrim(r->>'numero'), '');
      v_estado := coalesce(nullif(r->>'estado', ''), 'falta');
      v_comp := nullif(r->>'comprobante_id', '')::bigint;
      if v_prov is null or not exists (select 1 from cc.proveedores where codigo = v_prov) then
        raise exception 'Proveedor % no está dado de alta', coalesce(v_prov, '(vacío)');
      end if;
      if v_estado not in ('ok', 'falta') then
        raise exception 'Estado de remito inválido: %', v_estado;
      end if;
      if v_comp is not null and not exists (select 1 from cc.comprobantes where id = v_comp and proveedor_codigo = v_prov) then
        raise exception 'La factura % no es de %', v_comp, v_prov;
      end if;
      if v_num is not null then
        select id into v_id from cc.remitos
        where proveedor_codigo = v_prov and cc._clave_comprobante(numero) = cc._clave_comprobante(v_num)
          and estado <> 'anulado' limit 1;
        if v_id is not null then
          n_dup := n_dup + 1;
          ids := ids || jsonb_build_object('id', v_id, 'duplicado', true);
          continue;
        end if;
      end if;
      insert into cc.remitos (comprobante_id, proveedor_codigo, fecha, numero, retiro_por, autorizo,
                              archivo_link, estado, origen, importe)
      values (v_comp, v_prov, cc._fecha(r->'fecha'), v_num, cc._txt(r->'retiro_por'), cc._txt(r->'autorizo'),
              cc._txt(r->'archivo_link'), v_estado, p_origen, cc._num(r->'importe'))
      returning id into v_id;
      n_ok := n_ok + 1;
      ids := ids || jsonb_build_object('id', v_id, 'duplicado', false);
    exception when others then
      errores := errores || jsonb_build_object('remito', coalesce(v_prov, '?') || ' | ' || coalesce(v_num, 's/n'), 'error', sqlerrm);
    end;
  end loop;
  r := jsonb_build_object('cargados', n_ok, 'duplicados', n_dup, 'ids', ids, 'errores', errores);
  insert into cc.log_cargas (accion, detalle, resultado)
  values ('remitos', r, case when jsonb_array_length(errores) = 0 then 'ok' else 'error' end);
  return r;
end $$;

-- 3 -------------------------------------------------------------------------------
create or replace function cc.ligar_remito(p_remito bigint, p_comprobante bigint) returns void
language plpgsql as $$
declare v_r cc.remitos; v_prov text;
begin
  select * into v_r from cc.remitos where id = p_remito for update;
  if v_r.id is null then raise exception 'No existe el remito %', p_remito; end if;
  select proveedor_codigo into v_prov from cc.comprobantes where id = p_comprobante;
  if v_prov is null then raise exception 'No existe la factura %', p_comprobante; end if;
  if v_prov <> v_r.proveedor_codigo then
    raise exception 'El remito es de % y la factura de %', v_r.proveedor_codigo, v_prov;
  end if;
  if v_r.comprobante_id is not null and v_r.comprobante_id <> p_comprobante then
    raise exception 'El remito ya está atado a otra factura (%)', v_r.comprobante_id;
  end if;
  update cc.remitos set comprobante_id = p_comprobante where id = p_remito;
end $$;

grant execute on function cc.cargar_remitos(jsonb, text), cc.ligar_remito(bigint, bigint) to app_compras;

insert into app.migraciones (archivo, huella) values ('021_entrada.sql', null) on conflict (archivo) do nothing;
