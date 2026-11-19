-- Comprobante del pago subido desde "Para pagar" (18/11). Mientras la app no tenga
-- permiso de escritura en SharePoint, el archivo queda acá (PDF o imagen, hasta 5 MB) y
-- cc.ordenes_pago.comprobante_link apunta a /op/<número>/comprobante. Cuando haya
-- SharePoint, se sube allá y esta tabla deja de usarse.
-- Se aplica con el dueño de la base. Aplicado en dev-app-compras el 18/11.

create table if not exists app.comprobantes_pago (
  op_numero  text primary key references cc.ordenes_pago(numero),
  nombre     text not null,
  tipo       text not null check (tipo in ('application/pdf', 'image/jpeg', 'image/png')),
  archivo    bytea not null check (octet_length(archivo) <= 5 * 1024 * 1024),
  subido_por text not null,
  subido_en  timestamptz not null default now()
);
grant select, insert on app.comprobantes_pago to app_compras;
