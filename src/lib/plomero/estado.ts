/**
 * Cómo está el plomero (el bot de Adriano que carga facturas, OP y pagos en cc). Corre
 * cada hora de lunes a viernes de 8 a 20 (hora de Mendoza). Mismo criterio que Central
 * de pagos: andando si corrió hace 75 minutos o menos; fuera de horario, descansa.
 */
export type EstadoGeneral = "Andando" | "Descansa" | "Parado";

export const MINUTOS_ANDANDO = 75;

/** `ahora` y `ultima` en ISO; `hora` y `diaSemana` (0 domingo) son los de Mendoza. */
export function estadoGeneral(ultima: string | null, ahora: string, hora: number, diaSemana: number): EstadoGeneral {
  const enHorario = diaSemana >= 1 && diaSemana <= 5 && hora >= 8 && hora < 21;
  if (ultima && (Date.parse(ahora) - Date.parse(ultima)) / 60_000 <= MINUTOS_ANDANDO) return "Andando";
  return enHorario ? "Parado" : "Descansa";
}

export interface Proceso {
  proceso: string;
  modo: string;
  ultima: string;
  resultado: string;
  procesados: number;
  err7: number;
  corr24: number;
  ultima_novedad: string;
  error: string;
  ignorado: boolean;
}

export type EstadoProceso = "ok" | "error" | "prueba" | "quieto";

/**
 * Cada proceso: en prueba si corre en modo sombra (no escribe de verdad), con error si
 * la última corrida falló y nadie lo silenció, quieto si no corrió en las últimas 24 h
 * (los diarios, como el respaldo o el IVA mensual, se miran aparte), ok si no.
 */
export function estadoProceso(p: Proceso): EstadoProceso {
  if (p.modo === "sombra") return "prueba";
  if (p.resultado === "error" && !p.ignorado) return "error";
  if (p.corr24 === 0 && !["respaldo", "iva_mensual", "parte", "revision"].includes(p.proceso)) return "quieto";
  return "ok";
}

/** Para qué sirve cada proceso, en una línea (de su README). */
export const QUE_HACE: Record<string, string> = {
  mail: "Baja los adjuntos de los mails de facturas",
  facturas: "Lee las facturas nuevas (QR e IA), las carga y archiva el PDF",
  completar: "Completa remitos y quién retiró",
  estados: "Copia los estados de las OP de ClickUp",
  ops: "Arma OP desde las CC aprobadas",
  pagos: "Registra los pagos",
  adjuntos: "Sube los adjuntos a SharePoint",
  movimientos: "Registra movimientos",
  revision: "Manda el mail \"Para completar hoy\"",
  parte: "Arma el parte diario",
  respaldo: "Hace el respaldo de la base",
  iva_mensual: "Arma el libro de IVA (el día 11)",
};
