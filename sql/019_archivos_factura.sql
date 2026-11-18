-- Archivo de una factura cargada desde la app (18/11): la foto o el PDF que se subió en
-- "Añadir factura" de la Bandeja. Mientras la app no tenga permiso de escritura en
-- SharePoint queda acá, igual que el comprobante del pago (sql/010) y las constancias
-- (sql/014); el archivo_link de la factura apunta a /bandeja/<id>/archivo. Uno por
-- factura; se agrega, no se borra (el rol de la app no borra). El hash permite saber si
-- el mismo archivo ya se subió. Se aplica con el dueño de la base.
-- Numerado 019 porque adriano/fase-3 ya usa del 015 al 018.

create table if not exists app.archivos_factura (
  comprobante_id bigint primary key references cc.comprobantes(id),
  nombre         text not null,
  tipo           text not null check (tipo in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  archivo        bytea not null check (octet_length(archivo) <= 10 * 1024 * 1024),
  sha256         text not null,
  subido_por     text not null,
  subido_en      timestamptz not null default now()
);
create index if not exists archivos_factura_hash on app.archivos_factura (sha256);

grant select, insert on app.archivos_factura to app_compras;
