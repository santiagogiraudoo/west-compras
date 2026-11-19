-- Rol de la app (app_compras): lee todo, inserta y actualiza, no borra, ejecuta las
-- funciones de cc. En dev-app-compras se armó a mano el 17/11; esto lo deja escrito
-- para production. Va antes de 001.
--
-- El rol con su contraseña se crea desde Neon (consola o API: "create role"), no acá:
-- la contraseña no va al repo. Después se corre este archivo con el dueño de la base.

grant usage on schema cc to app_compras;
grant select, insert, update on all tables in schema cc to app_compras;
grant usage, select on all sequences in schema cc to app_compras;
grant execute on all functions in schema cc to app_compras;

-- Lo que el dueño cree después en cc, con los mismos permisos.
alter default privileges for role neondb_owner in schema cc grant select, insert, update on tables to app_compras;
alter default privileges for role neondb_owner in schema cc grant usage, select on sequences to app_compras;

-- Esquema app (lo propio de la app): se crea en 001; acá sus permisos por defecto.
create schema if not exists app;
grant usage on schema app to app_compras;
alter default privileges for role neondb_owner in schema app grant select, insert, update, delete on tables to app_compras;
alter default privileges for role neondb_owner in schema app grant usage, select on sequences to app_compras;
