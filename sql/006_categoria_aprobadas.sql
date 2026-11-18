-- Categoría para las facturas de West Desarrolladora aprobadas antes de la lista única
-- (sql/005): la sugerida, con la misma regla que categoriaSugerida()
-- (src/lib/facturas/categorias.ts). OK de Adriano, 18/11.
-- Solo toca las aprobadas sin categoría; las que alguien eligió no se pisan.
-- Se aplica con el dueño de la base. Aplicado en dev-app-compras el 18/11.

update cc.comprobantes c set categoria = case
    when c.unidad_codigo in ('UN-02', 'UN-03', 'UN-19', 'UN-28', 'UN-31') then 'Obra'
    when p.rubro = 'Combustible' then 'Servicios'
    when c.unidad_codigo = 'UN-23' then 'Insumos de oficina'
    else 'Reparaciones'
  end
from cc.proveedores p, cc.unidades u
where p.codigo = c.proveedor_codigo
  and u.codigo = c.unidad_codigo
  and u.marca = 'West Desarrolladora'
  and c.estado_aprobacion = 'Aprobado'
  and c.categoria is null;
