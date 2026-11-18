import { prisma } from "@/lib/prisma";
import { faltantesProveedor, type DatosProveedor } from "@/lib/facturas/requisitos";
import type { EstadoOP, LineaAprobacion } from "./estados";
import type { Constancia } from "./constancias";

/**
 * OP armadas en la app (app.ops), con su estado de app.v_op_estado. Montos y fechas
 * salen como texto para no mezclar el Decimal de Prisma con decimal.js.
 */
export interface OPApp extends DatosProveedor {
  numero: string;
  fecha_op: string;
  estado: EstadoOP;
  proveedor_codigo: string;
  razon_social: string;
  banco: string | null;
  titular: string | null;
  total_imputado: string;
  armada_por: string;
  armada_en: string;
  enviada_por: string | null;
  enviada_en: string | null;
}

export interface OPConLineas extends OPApp {
  lineas: LineaAprobacion[];
  faltan: string[];
}

/** OP de la app que no están pagadas ni descartadas, con sus renglones de factura. */
export async function listarOPsApp(estados?: EstadoOP[]): Promise<OPConLineas[]> {
  const [ops, lineas] = await Promise.all([
    prisma.$queryRaw<OPApp[]>`
      select o.numero, o.fecha_op::text, e.estado, o.proveedor_codigo, p.razon_social,
        p.cuit, p.cbu, p.alias, p.banco, p.cuenta_titular, p.medio_pago_habitual, p.condicion_iva,
        p.telefono, p.rubro, p.condicion_pago, o.titular, o.total_imputado::text,
        a.armada_por, (a.armada_en at time zone 'America/Argentina/Mendoza')::date::text as armada_en,
        a.enviada_por, (a.enviada_en at time zone 'America/Argentina/Mendoza')::date::text as enviada_en
      from app.ops a
      join cc.ordenes_pago o on o.numero = a.op_numero
      join app.v_op_estado e on e.op_numero = a.op_numero
      join cc.proveedores p on p.codigo = o.proveedor_codigo
      where e.estado not in ('Pagada', 'Descartada')
      order by o.numero`,
    prisma.$queryRaw<LineaAprobacion[]>`
      select i.op_numero, c.id::text, c.tipo, c.numero, c.fecha::text, c.vencimiento::text,
        i.unidad_codigo as unidad, un.nombre as unidad_nombre, i.importe::text, i.partida, c.archivo_link,
        coalesce(c.retiro_por, r.retiro_por) as quien, r.importe::text as remito_importe, r.remitos,
        c.total::text as factura_total, c.neto::text as factura_neto,
        -- Para qué: solo lo cargado en los renglones. La nota de la factura (descripcion)
        -- es de cuando se procesa la factura ("revisada OK", CAE, remitos) y no va acá.
        it.para_que as para_que,
        (r.n > 0 or c.retiro_por is not null) as tiene_remito,
        l.decision, l.motivo, l.usuario, (l.creado_en at time zone 'America/Argentina/Mendoza')::date::text as decidido_en,
        au.id as aprobador_id, au.name as aprobador, it.items
      -- Un renglón por factura y unidad: una factura con ítems de varias unidades se parte.
      from app.v_op_renglones i
      join app.v_op_estado e on e.op_numero = i.op_numero and e.estado not in ('Pagada', 'Descartada')
      join cc.comprobantes c on c.id = i.comprobante_id
      left join cc.unidades un on un.codigo = i.unidad_codigo
      left join lateral (
        -- Solo remitos firmados: "falta" es remito sin firmar y "anulado" no cuenta.
        select count(*) as n, string_agg(distinct rm.retiro_por, ', ') as retiro_por, sum(rm.importe) as importe,
          json_agg(json_build_object('numero', rm.numero, 'fecha', rm.fecha::text, 'autorizo', rm.autorizo,
            'archivo_link', case when rm.archivo_link like 'http%' then rm.archivo_link end) order by rm.fecha) as remitos
        from cc.remitos rm where rm.comprobante_id = c.id and rm.estado = 'ok') r on true
      left join lateral (
        select string_agg(distinct x.para_que, ', ') as para_que,
          json_agg(json_build_object('descripcion', x.descripcion, 'cantidad', x.cantidad::text,
            'precio', x.precio_unitario::text, 'anterior', x.anterior::text,
            'anterior_fecha', x.anterior_fecha::text) order by x.orden) as items
        from (
          select ci.*, prev.precio_unitario as anterior, prev.fecha as anterior_fecha
          from cc.comprobante_items ci
          -- La última compra del mismo ítem al mismo proveedor, antes de esta factura.
          left join lateral (
            select ci2.precio_unitario, c2.fecha
            from cc.comprobante_items ci2 join cc.comprobantes c2 on c2.id = ci2.comprobante_id
            where c2.proveedor_codigo = c.proveedor_codigo and c2.id <> c.id and c2.fecha <= c.fecha
              and lower(trim(ci2.descripcion)) = lower(trim(ci.descripcion))
              and ci2.precio_unitario > 0 and coalesce(c2.estado_aprobacion, '') <> 'Anulado'
            order by c2.fecha desc, c2.id desc limit 1) prev on true
          where ci.comprobante_id = c.id
            and coalesce(ci.unidad_codigo, c.unidad_codigo) is not distinct from i.unidad_codigo) x) it on true
      left join app.v_aprobacion_linea l on l.op_numero = i.op_numero and l.comprobante_id = i.comprobante_id
        and l.unidad_codigo is not distinct from i.unidad_codigo
      left join app.aprobadores ap on ap.unidad_codigo = i.unidad_codigo
      -- Un aprobador inactivo o de consulta no puede decidir: el renglón queda para un admin.
      left join app.users au on au.id = ap.usuario_id and au.active and au.role in ('admin', 'operador')
      order by i.op_numero, c.fecha, c.numero, i.unidad_codigo`,
  ]);
  return ops
    .filter((o) => !estados || estados.includes(o.estado))
    .map((o) => ({ ...o, lineas: lineas.filter((l) => l.op_numero === o.numero), faltan: faltantesProveedor(o) }));
}

export interface CompraAnterior {
  proveedor_codigo: string;
  tipo: string;
  numero: string;
  fecha: string;
  total: string;
}

/** "Ver más": deuda del proveedor en West Desarrolladora y sus últimas 5 facturas. */
export async function contextoProveedores(codigos: string[]): Promise<{
  deuda: Record<string, string>;
  ultimas: Record<string, CompraAnterior[]>;
}> {
  if (codigos.length === 0) return { deuda: {}, ultimas: {} };
  const [deudas, compras] = await Promise.all([
    prisma.$queryRaw<{ proveedor_codigo: string; deuda: string }[]>`
      select s.proveedor_codigo, sum(s.saldo)::text as deuda
      from cc.v_saldo_comprobante s
      join cc.unidades u on u.codigo = s.unidad_codigo and u.marca = 'West Desarrolladora'
      where s.estado_aprobacion = 'Aprobado' and s.proveedor_codigo = any(${codigos})
      group by 1`,
    prisma.$queryRaw<CompraAnterior[]>`
      select proveedor_codigo, tipo, numero, fecha::text, total::text from (
        select c.*, row_number() over (partition by c.proveedor_codigo order by c.fecha desc, c.id desc) n
        from cc.comprobantes c
        where c.proveedor_codigo = any(${codigos}) and coalesce(c.estado_aprobacion, '') <> 'Anulado') x
      where n <= 5 order by proveedor_codigo, fecha desc`,
  ]);
  const ultimas: Record<string, CompraAnterior[]> = {};
  for (const c of compras) (ultimas[c.proveedor_codigo] ??= []).push(c);
  return { deuda: Object.fromEntries(deudas.map((d) => [d.proveedor_codigo, d.deuda])), ultimas };
}

/** Estado de una OP de la app, para que las acciones vuelvan a chequear en el server. */
export async function estadoOP(numero: string): Promise<EstadoOP | null> {
  const r = await prisma.$queryRaw<{ estado: EstadoOP }[]>`
    select estado from app.v_op_estado where op_numero = ${numero}`;
  return r[0]?.estado ?? null;
}

/** Las constancias de una OP (app.constancias_op, sql/014), sin el archivo: se ven por su link. */
export async function listarConstancias(numero: string): Promise<Constancia[]> {
  return prisma.$queryRaw<Constancia[]>`
    select id, nombre, tipo, nota, subido_por,
      to_char(subido_en at time zone 'America/Argentina/Mendoza', 'DD/MM/YYYY HH24:MI') as subido_en,
      octet_length(archivo)::int as tamano
    from app.constancias_op where op_numero = ${numero}
    order by subido_en, id`;
}

/** Un paso en la historia de una OP: quién hizo qué y cuándo. */
export interface EventoOP {
  cuando: string;
  quien: string | null;
  que: string;
  /** Las facturas a las que se aplicó (una decisión por OP cae en varias). */
  facturas: string[];
  detalle: string | null;
}

/**
 * La historia de una OP de la app, la más nueva arriba: armada, mandada a aprobar, cada
 * decisión por renglón (también las quitadas y las facturas sacadas) y el descarte.
 * Sale de app.ops y app.aprobaciones_op, que se agregan y no se pisan.
 */
export async function historialOP(numero: string): Promise<EventoOP[]> {
  return prisma.$queryRaw<EventoOP[]>`
    -- Una decisión por OP se graba una vez por renglón: se junta en un paso con sus facturas.
    select to_char(h.cuando at time zone 'America/Argentina/Mendoza', 'DD/MM/YYYY HH24:MI') as cuando, h.quien, h.que,
      coalesce(array_agg(h.factura order by h.factura) filter (where h.factura is not null), '{}') as facturas, h.detalle
    from (
      select date_trunc('minute', armada_en) as cuando, armada_por as quien, 'Armada' as que, null::text as factura, null::text as detalle
      from app.ops where op_numero = ${numero}
      union all
      select date_trunc('minute', enviada_en), enviada_por, 'Mandada a aprobar', null, null from app.ops where op_numero = ${numero} and enviada_en is not null
      union all
      select date_trunc('minute', a.creado_en), a.usuario,
        case a.decision when 'Quitada' then case when a.motivo like 'Sacada de la OP%' then 'Factura sacada' else 'Decisión quitada' end
          else a.decision end,
        c.numero, nullif(regexp_replace(a.motivo, '^Sacada de la OP: ', ''), '')
      from app.aprobaciones_op a join cc.comprobantes c on c.id = a.comprobante_id
      where a.op_numero = ${numero}
      union all
      select date_trunc('minute', descartada_en), descartada_por, 'Descartada', null, motivo_descarte from app.ops where op_numero = ${numero} and descartada_en is not null
    ) h
    group by h.cuando, h.quien, h.que, h.detalle
    order by h.cuando desc, h.que`;
}

/** Una OP de la app ya cerrada: pagada o descartada. */
export interface OPCerrada {
  numero: string;
  estado: "Pagada" | "Descartada";
  razon_social: string;
  proveedor_codigo: string;
  total_imputado: string;
  neto_transferir: string | null;
  /** Pagada: el día que salió la plata. Descartada: el día que se descartó. */
  fecha: string | null;
  comprobante_link: string | null;
  motivo_descarte: string | null;
}

/** Las OP de la app pagadas o descartadas en los últimos `dias`, la más nueva arriba. */
export async function listarCerradas(hoy: string, dias = 60): Promise<OPCerrada[]> {
  return prisma.$queryRaw<OPCerrada[]>`
    select o.numero, e.estado, p.razon_social, o.proveedor_codigo, o.total_imputado::text, o.neto_transferir::text,
      (case when e.estado = 'Pagada' then coalesce(o.fecha_salida_caja, o.fecha_op)
            else (a.descartada_en at time zone 'America/Argentina/Mendoza')::date end)::text as fecha,
      o.comprobante_link, a.motivo_descarte
    from app.ops a
    join app.v_op_estado e on e.op_numero = a.op_numero and e.estado in ('Pagada', 'Descartada')
    join cc.ordenes_pago o on o.numero = a.op_numero
    join cc.proveedores p on p.codigo = o.proveedor_codigo
    where coalesce(o.fecha_salida_caja, o.fecha_op, (a.descartada_en)::date) >= ${hoy}::date - ${dias}::int
    order by 7 desc nulls last, o.numero desc`;
}
