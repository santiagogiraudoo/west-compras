import { prisma } from "@/lib/prisma";
import { getFakeOffset } from "@/lib/dev/fake-date";
import type { Proceso } from "./estado";

/**
 * Lo que el plomero deja en cc.ejecuciones (una fila por corrida, con el detalle en
 * jsonb) y cc.log_cargas. Solo se lee: las mismas consultas que Central de pagos.
 */

/** La última corrida de cada proceso en 30 días, con sus errores de 7 días y corridas de 24 h. */
export async function procesosPlomero(): Promise<Proceso[]> {
  return prisma.$queryRaw<Proceso[]>`
    with e as (select proceso, modo, inicio, resultado, procesados, detalle from cc.ejecuciones where inicio > now() - interval '30 days'),
    u as (select distinct on (proceso) proceso, modo, inicio, resultado, procesados, detalle from e order by proceso, inicio desc),
    s as (select proceso, (count(*) filter (where resultado = 'error' and inicio > now() - interval '7 days'))::int as err7,
      (count(*) filter (where inicio > now() - interval '24 hours'))::int as corr24, max(inicio) filter (where resultado = 'ok') as ult_novedad
      from e group by 1)
    select u.proceso, u.modo, to_char(u.inicio, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ultima, coalesce(u.resultado, 'en curso') as resultado,
      coalesce(u.procesados, 0)::int as procesados, s.err7, s.corr24,
      coalesce(to_char(s.ult_novedad, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '') as ultima_novedad,
      case when u.resultado = 'error' then left(coalesce(split_part((select x->>'error' from jsonb_array_elements(
        case when jsonb_typeof(u.detalle) = 'array' then u.detalle else '[]'::jsonb end) x where x ? 'error' limit 1), E'\n', 1), 'error sin detalle'), 300)
        else '' end as error,
      exists (select 1 from cc.alertas_ignoradas a where a.id = u.proceso and (a.hasta is null or a.hasta >= current_date)) as ignorado
    from u join s using (proceso)
    order by u.proceso`;
}

/** La última corrida de cualquier proceso en modo real (para saber si está andando). */
export async function ultimaCorrida(): Promise<string | null> {
  const [r] = await prisma.$queryRaw<{ ultima: string | null }[]>`
    select to_char(max(inicio), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ultima from cc.ejecuciones where modo = 'real'`;
  return r?.ultima ?? null;
}

export interface Hecho { dia: string; tipo: string; n: number; ejemplos: string | null }

/** Lo que hizo por día y tipo en los últimos `dias` (facturas cargadas, OP armadas, pagos…). */
export async function hechoPlomero(dias = 7): Promise<Hecho[]> {
  return prisma.$queryRaw<Hecho[]>`
    select dia, tipo, n, ejemplos from (
      select (e.inicio at time zone 'America/Argentina/Mendoza')::date::text as dia, t.tipo, count(*)::int as n,
        array_to_string((array_agg(nullif(t.txt, '') order by e.inicio desc))[1:4], ' · ') as ejemplos
      from cc.ejecuciones e
      cross join lateral jsonb_array_elements(case when jsonb_typeof(e.detalle) = 'array' then e.detalle else '[]'::jsonb end) x
      cross join lateral (select
        case when e.proceso = 'facturas' and x->>'resultado' like 'CARGADA%' then 'Facturas cargadas'
          when e.proceso = 'facturas' and (x->'archivar'->>'resultado' = 'archivada' or x->>'resultado' like '%PDF archivado%' or x->'link'->>'resultado' = 'link arreglado') then 'PDF archivados'
          when e.proceso = 'ops' and x ? 'url' and x ? 'nombre' and x ? 'op' then 'OP armadas'
          when e.proceso = 'ops' and x ? 'cc_creada' then 'CC creadas'
          when e.proceso = 'pagos' and x->>'resultado' like '%REGISTRADA%' then 'Pagos registrados'
          when e.proceso = 'mail' and x->>'resultado' like 'guardado%' then 'Adjuntos de mail'
          when e.proceso = 'completar' and (x ? 'remito' or x ? 'retiro') then 'Remitos y retiros'
          when e.proceso = 'estados' and x ? 'anulada' then 'OP anuladas'
          when e.proceso = 'estados' and x ? 'asignada_a' then 'Aprobador asignado'
          when e.proceso = 'respaldo' and x->>'respaldo' like 'cc_%' then 'Respaldo de la base' end as tipo,
        coalesce(x->>'nombre', x->>'factura', x->'archivar'->>'factura', x->'link'->>'factura',
          case when x ? 'proveedor' and x ? 'numero' then (x->>'proveedor') || ' ' || (x->>'numero') end, x->>'op', x->>'adjunto', x->>'respaldo', '') as txt) t
      where e.inicio > now() - (${dias}::int * interval '1 day') and e.modo = 'real' and t.tipo is not null
      group by 1, 2) z
    order by dia desc, n desc`;
}

export interface ErrorPlomero { cuando: string; proceso: string; motivo: string; resuelto: boolean }

/** Errores de 14 días (corridas y cargas); resuelto si después corrió bien o se silenció. */
export async function erroresPlomero(): Promise<ErrorPlomero[]> {
  return prisma.$queryRaw<ErrorPlomero[]>`
    select cuando, proceso, motivo, resuelto from (
      select to_char(e.inicio at time zone 'America/Argentina/Mendoza', 'YYYY-MM-DD HH24:MI') as cuando, e.proceso,
        left(coalesce(nullif(split_part(x.err, E'\n', 1), ''), e.detalle::text), 300) as motivo,
        exists (select 1 from cc.ejecuciones l where l.proceso = e.proceso and l.inicio > e.inicio and l.resultado is distinct from 'error')
          or exists (select 1 from cc.alertas_ignoradas a where a.id = e.proceso and (a.hasta is null or a.hasta >= current_date)) as resuelto
      from cc.ejecuciones e
      left join lateral (select y->>'error' as err from jsonb_array_elements(case when jsonb_typeof(e.detalle) = 'array' then e.detalle else '[]'::jsonb end) y
        where y ? 'error' limit 1) x on true
      where e.resultado = 'error' and e.inicio > now() - interval '14 days'
      union all
      select to_char(l.momento at time zone 'America/Argentina/Mendoza', 'YYYY-MM-DD HH24:MI'), 'carga · ' || l.accion,
        left(coalesce(l.mensaje, (l.detalle->'errores')::text, ''), 300),
        exists (select 1 from cc.alertas_ignoradas a where a.id = 'error_carga|' || l.id)
          or exists (select 1 from cc.log_cargas m where m.accion = l.accion and m.momento > l.momento and m.resultado = 'ok')
      from cc.log_cargas l where l.resultado = 'error' and l.momento > now() - interval '14 days') z
    order by cuando desc limit 15`;
}

/** Ahora (con la fecha simulada de desarrollo), y la hora y el día de la semana en Mendoza. */
export function ahoraEnMendoza(): { ahora: number; hora: number; dia: number } {
  const ahora = Date.now() + getFakeOffset();
  const partes = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", weekday: "short", timeZone: "America/Argentina/Mendoza" })
    .formatToParts(new Date(ahora));
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.find((p) => p.type === "weekday")?.value ?? "Sun");
  return { ahora, hora, dia };
}

export interface IAFacturas {
  leidas: number;
  cargadas: number;
  sin_qr: number;
  con_alertas: number;
  no_factura: number;
  tokens_entrada: number;
  tokens_salida: number;
}

/**
 * Cómo viene la lectura de facturas con IA (proceso "facturas", modo real, 30 días):
 * cuántas leyó, cuántas cargó, cuántas sin QR de ARCA (solo IA, sin el control del QR),
 * cuántas con alertas y los tokens que gastó. Sale del detalle de cada corrida.
 */
export async function iaFacturas(): Promise<IAFacturas> {
  const [r] = await prisma.$queryRaw<IAFacturas[]>`
    select count(*) filter (where x ? 'origen')::int as leidas,
      count(*) filter (where x->>'resultado' like 'CARGADA%')::int as cargadas,
      count(*) filter (where x->>'origen' = 'ia')::int as sin_qr,
      count(*) filter (where jsonb_typeof(x->'alertas') = 'array' and jsonb_array_length(x->'alertas') > 0)::int as con_alertas,
      count(*) filter (where x->>'resultado' like 'no es factura%')::int as no_factura,
      coalesce(sum((x->'tokens'->>'entrada')::bigint), 0)::int as tokens_entrada,
      coalesce(sum((x->'tokens'->>'salida')::bigint), 0)::int as tokens_salida
    from cc.ejecuciones e
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e.detalle) = 'array' then e.detalle else '[]'::jsonb end) x
    where e.proceso = 'facturas' and e.modo = 'real' and e.inicio > now() - interval '30 days'`;
  return r;
}

export interface DocumentoPendiente { nombre: string | null; estado: string; motivo: string | null; carpeta: string | null; cuando: string }

/** Lo que el plomero no pudo cargar solo: documentos para revisar a mano o ilegibles. */
export async function documentosPendientes(): Promise<DocumentoPendiente[]> {
  return prisma.$queryRaw<DocumentoPendiente[]>`
    select nombre, estado, motivo, carpeta, to_char(coalesce(actualizado_en, creado_en) at time zone 'America/Argentina/Mendoza', 'YYYY-MM-DD') as cuando
    from cc.documentos where estado in ('revisar', 'ilegible')
    order by coalesce(actualizado_en, creado_en) desc limit 20`;
}
