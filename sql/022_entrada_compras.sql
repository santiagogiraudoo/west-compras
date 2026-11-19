-- El buzón también recibe confirmaciones de compra (19/11, docs/proyecto/09_flujo_entrada.md):
-- la compra entra a la app con su confirmación o con el remito, y queda la cadena
-- compra ← remitos → factura (cc.remitos.compra_id y comprobante_id; app.v_compras suma).
-- Se aplica con el dueño de la base.

alter table app.entrada drop constraint if exists entrada_clase_check;
alter table app.entrada add constraint entrada_clase_check
  check (clase in ('factura', 'nota_credito', 'nota_debito', 'remito', 'compra', 'comprobante_pago', 'otro'));
alter table app.entrada add column if not exists compra_id bigint references cc.compras(id);

-- cc.cargar_compras (de adriano/fase-3, sql/017) la ejecuta la app para las compras que
-- entran por el buzón, con clave "app:…" en lugar del id de ClickUp.
grant execute on function cc.cargar_compras(jsonb, text) to app_compras;

insert into app.migraciones (archivo, huella) values ('022_entrada_compras.sql', null) on conflict (archivo) do nothing;
