-- Pruebas del conciliador por consecuencia (sql/023). No deja nada: termina con un error a
-- propósito que deshace todo y muestra el resultado ("PRUEBAS OK" o la primera que falló).
-- Correr con el dueño de la base, por ejemplo: psql "$OWNER_URL" -f sql/pruebas/023_conciliar.sql
do $$
declare
  p text := 'PR-T23';
  hoy date := current_date;
  f1 bigint; f2 bigint; f3 bigint; f4 bigint; r1 bigint; r2 bigint; r3 bigint; r4 bigint; r5 bigint; r6 bigint;
  k1 bigint; v bigint; n int; ok text[] := '{}';
begin
  insert into cc.proveedores (codigo, razon_social, activo) values (p, 'Proveedor de prueba 023', true);
  -- Sin compras antes del corte que molesten: el corte para la prueba es hace 30 días.
  perform set_config('app.conciliar_compras_desde', (hoy - 30)::text, true);

  -- 1. Compra pedida y después su remito firmado por el mismo importe: se atan y queda entregada.
  insert into cc.compras (clickup_id, nombre, proveedor_codigo, importe, estado, fecha, origen)
  values ('prueba-k1', 'Pedido 00002-00000450', p, 1000, 'pedido confirmado', hoy - 5, 'app') returning id into k1;
  insert into cc.remitos (proveedor_codigo, numero, fecha, importe, estado, origen)
  values (p, '0001-00000001', hoy - 2, 1000, 'ok', 'app') returning id into r1;
  select compra_id into v from cc.remitos where id = r1;
  if v is distinct from k1 then raise exception 'FALLÓ 1: el remito no se ató a su compra (%)', v; end if;
  if (select estado from cc.compras where id = k1) <> 'hecho' then raise exception 'FALLÓ 1: la compra no quedó entregada'; end if;
  ok := array_append(ok, '1 remito→compra');

  -- 2. Llega la factura por el mismo importe: se ata al remito (y con él, a la compra).
  insert into cc.comprobantes (proveedor_codigo, tipo, numero, fecha, neto, iva, percepciones, total, estado_aprobacion, origen)
  values (p, 'Factura A', '00003-00000001', hoy - 1, 826.45, 173.55, 0, 1000, 'Pendiente', 'app') returning id into f1;
  if (select comprobante_id from cc.remitos where id = r1) is distinct from f1 then raise exception 'FALLÓ 2: la factura no se ató al remito'; end if;
  if (select facturado from app.v_compras where id = k1) <> 1000 then raise exception 'FALLÓ 2: v_compras no ve lo facturado'; end if;
  ok := array_append(ok, '2 factura→remito→compra');

  -- 3. Dos facturas abiertas del mismo total: un remito con ese importe no se ata (no adivina).
  insert into cc.comprobantes (proveedor_codigo, tipo, numero, fecha, total, estado_aprobacion, origen)
  values (p, 'Factura A', '00003-00000002', hoy - 1, 5000, 'Pendiente', 'app') returning id into f2;
  insert into cc.comprobantes (proveedor_codigo, tipo, numero, fecha, total, estado_aprobacion, origen)
  values (p, 'Factura A', '00003-00000003', hoy - 1, 5000, 'Pendiente', 'app') returning id into f3;
  insert into cc.remitos (proveedor_codigo, numero, fecha, importe, estado, origen)
  values (p, '0001-00000002', hoy - 1, 5000, 'ok', 'app') returning id into r2;
  if (select comprobante_id from cc.remitos where id = r2) is not null then raise exception 'FALLÓ 3: adivinó entre dos facturas iguales'; end if;
  ok := array_append(ok, '3 no adivina');

  -- 4. La factura cita el remito en su descripción: se ata aunque haya otra igual.
  update cc.comprobantes set descripcion = '[plomero] arena · Remito 00001-00000002' where id = f3;
  if (select comprobante_id from cc.remitos where id = r2) is distinct from f3 then raise exception 'FALLÓ 4: la cita en la factura no ató'; end if;
  ok := array_append(ok, '4 la factura cita el remito');

  -- 5. Factura de remitos: dos remitos que suman exacto el total.
  insert into cc.remitos (proveedor_codigo, numero, fecha, importe, estado, origen)
  values (p, '0001-00000010', hoy - 9, 300.25, 'ok', 'app') returning id into r3;
  insert into cc.remitos (proveedor_codigo, numero, fecha, importe, estado, origen)
  values (p, '0001-00000011', hoy - 8, 699.75, 'ok', 'app') returning id into r4;
  insert into cc.comprobantes (proveedor_codigo, tipo, numero, fecha, total, estado_aprobacion, origen)
  values (p, 'Factura A', '00003-00000004', hoy, 1000.00, 'Pendiente', 'app') returning id into f4;
  -- (f1 también es de 1000 pero ya tiene remito: no compite)
  select count(*) into n from cc.remitos where id in (r3, r4) and comprobante_id = f4;
  if n <> 2 then raise exception 'FALLÓ 5: la factura de remitos ató % de 2', n; end if;
  ok := array_append(ok, '5 suma de remitos');

  -- 6. El remito cita la factura (lo que leyó el Buzón): se ata al guardar la lectura.
  insert into cc.comprobantes (proveedor_codigo, tipo, numero, fecha, total, estado_aprobacion, origen)
  values (p, 'Factura A', '00003-00000099', hoy, 77, 'Pendiente', 'app');
  insert into cc.remitos (proveedor_codigo, numero, fecha, estado, origen)
  values (p, '0001-00000020', hoy, 'falta', 'app') returning id into r5;
  insert into app.entrada (sha256, canal, nombre, tipo, archivo, estado, proveedor_codigo, lectura)
  values ('prueba-023-' || r5, 'app', 'r.pdf', 'application/pdf', '\x25504446'::bytea, 'procesado', p,
          jsonb_build_object('remito', jsonb_build_object('facturas_citadas', jsonb_build_array('3-99'))));
  update app.entrada set remito_id = r5 where sha256 = 'prueba-023-' || r5;
  if (select c.numero from cc.remitos r join cc.comprobantes c on c.id = r.comprobante_id where r.id = r5) is distinct from '00003-00000099' then
    raise exception 'FALLÓ 6: la cita del remito no ató';
  end if;
  ok := array_append(ok, '6 el remito cita la factura');

  -- 7. Remito sin compra que le corresponda: crea la suya. Y antes del corte, no.
  insert into cc.remitos (proveedor_codigo, numero, fecha, importe, estado, origen)
  values (p, '0001-00000030', hoy, 123, 'falta', 'app') returning id into r6;
  if (select k.clickup_id from cc.remitos r join cc.compras k on k.id = r.compra_id where r.id = r6) <> 'app:remito-' || r6 then
    raise exception 'FALLÓ 7: el remito no creó su compra';
  end if;
  insert into cc.remitos (proveedor_codigo, numero, fecha, importe, estado, origen)
  values (p, '0001-00000031', hoy - 60, 9, 'falta', 'app') returning id into v;
  if (select compra_id from cc.remitos where id = v) is not null then raise exception 'FALLÓ 7: inventó compra antes del corte'; end if;
  ok := array_append(ok, '7 compra desde el remito y corte');

  -- 8. Sin duplicar: tocar todo de nuevo no crea otra compra ni cambia lo atado.
  select count(*) into n from cc.compras where proveedor_codigo = p;
  update cc.remitos set estado = estado where proveedor_codigo = p;
  update cc.comprobantes set total = total where proveedor_codigo = p;
  if (select count(*) from cc.compras where proveedor_codigo = p) <> n then raise exception 'FALLÓ 8: duplicó compras'; end if;
  ok := array_append(ok, '8 idempotente');

  -- 9. El remito llega antes que su confirmación de compra: crea una provisoria; al llegar la
  --    compra de verdad, el remito pasa a ella y la provisoria queda descartada.
  insert into cc.remitos (proveedor_codigo, numero, fecha, importe, estado, origen)
  values (p, '0001-00000040', hoy, 4321, 'ok', 'app') returning id into v;
  if (select k.clickup_id from cc.remitos r join cc.compras k on k.id = r.compra_id where r.id = v) <> 'app:remito-' || v then raise exception 'FALLÓ 9: no creó la provisoria'; end if;
  insert into cc.compras (clickup_id, nombre, proveedor_codigo, importe, estado, fecha, origen)
  values ('prueba-k9', 'Pedido 00002-00000999', p, 4321, 'pedido confirmado', hoy - 1, 'app') returning id into k1;
  if (select compra_id from cc.remitos where id = v) is distinct from k1 then raise exception 'FALLÓ 9: el remito no pasó a la compra de verdad'; end if;
  if (select estado from cc.compras where clickup_id = 'app:remito-' || v) <> 'descartado' then raise exception 'FALLÓ 9: la provisoria no quedó descartada'; end if;
  if (select estado from cc.compras where id = k1) <> 'hecho' then raise exception 'FALLÓ 9: la compra no quedó entregada'; end if;
  ok := array_append(ok, '9 compra después del remito');

  raise exception 'PRUEBAS OK (se deshace todo): %', array_to_string(ok, ' · ');
end $$;
