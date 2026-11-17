-- Esquema `app`: lo propio de la app de compras (lo de proveedores sigue en `cc`).
-- Se aplica con el dueño de la base (DIRECT_URL). En la rama dev-app-compras ya está aplicado.

create schema if not exists app;

create table if not exists app.users (
  id            serial primary key,
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  role          text not null default 'consulta' check (role in ('admin','operador','consulta')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

grant select, insert, update, delete on app.users to app_compras;
grant usage, select on sequence app.users_id_seq to app_compras;
