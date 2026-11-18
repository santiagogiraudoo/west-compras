-- Constancias de una OP (18/11): fotos o PDF que alguien quiere dejar asentados al
-- aprobar o pagar (la mercadería entregada, el remito firmado, una charla con el
-- proveedor). Mientras la app no tenga permiso de escritura en SharePoint, quedan acá,
-- igual que el comprobante del pago (sql/010). Se agregan, no se borran: el rol de la
-- app no borra. Se aplica con el dueño de la base. Aplicado en dev-app-compras el 18/11.

create table if not exists app.constancias_op (
  id         serial primary key,
  op_numero  text not null references cc.ordenes_pago(numero),
  nombre     text not null,
  tipo       text not null check (tipo in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  archivo    bytea not null check (octet_length(archivo) <= 5 * 1024 * 1024),
  nota       text,
  subido_por text not null,
  subido_en  timestamptz not null default now()
);
create index if not exists constancias_op_por_op on app.constancias_op (op_numero, subido_en);

grant select, insert on app.constancias_op to app_compras;
grant usage, select on sequence app.constancias_op_id_seq to app_compras;
