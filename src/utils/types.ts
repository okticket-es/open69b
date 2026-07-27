/**
 * Tipos para el servicio SAT 69-B.
 */

/**
 * Estados posibles de un contribuyente en la lista 69-B.
 */
export enum Sat69bStatus {
  PRESUNTO = "Presunto",
  DEFINITIVO = "Definitivo",
  DESVIRTUADO = "Desvirtuado",
  SENTENCIA_FAVORABLE = "Sentencia Favorable",
}

/**
 * Información de un paso del proceso (presunción, desvirtuado, definitivo, sentencia).
 */
export interface ProcessStep {
  oficioSat: string | null;
  fechaSat: string | null;
  oficioDof: string | null;
  fechaDof: string | null;
}

/**
 * Un expediente 69-B (un procedimiento del SAT sobre un RFC).
 * Un RFC puede tener varios expedientes en años distintos.
 */
export interface Expediente {
  situacion: Sat69bStatus | null;
  presuncion: ProcessStep;
  desvirtuado: ProcessStep;
  definitivo: ProcessStep;
  sentenciaFavorable: ProcessStep;
}

/** Fila del CSV: un expediente con su RFC y nombre. */
export type Sat69bEntry = Expediente & { rfc: string; nombre: string };

/**
 * Registro agregado por RFC — lo que se persiste y se consulta.
 * `situacion` es la más severa entre los expedientes.
 */
export interface Sat69bRecord {
  rfc: string;
  nombre: string;
  situacion: Sat69bStatus | null;
  expedientes: Expediente[];
}

/** Orden de severidad para elegir la situación del record (peor primero). */
export const SEVERITY_ORDER: Sat69bStatus[] = [
  Sat69bStatus.DEFINITIVO,
  Sat69bStatus.PRESUNTO,
  Sat69bStatus.DESVIRTUADO,
  Sat69bStatus.SENTENCIA_FAVORABLE,
];

/** Devuelve la situación más severa entre expedientes (null si ninguna). */
export function worstSituacion(expedientes: Expediente[]): Sat69bStatus | null {
  let worst: Sat69bStatus | null = null;
  let worstRank = Number.POSITIVE_INFINITY;
  for (const e of expedientes) {
    if (e.situacion === null) continue;
    const rank = SEVERITY_ORDER.indexOf(e.situacion);
    if (rank !== -1 && rank < worstRank) {
      worstRank = rank;
      worst = e.situacion;
    }
  }
  return worst;
}

/** Vista plana histórica del record (compatibilidad v1 de la API). */
export type LegacyRecordView = {
  rfc: string;
  nombre: string;
  situacion: Sat69bStatus | null;
} & Expediente;

/**
 * Veredicto temporal: qué supuesto estaba vigente para el RFC a una fecha dada.
 * `vigente` nunca incluye expedientes exculpados (Desvirtuado/Sentencia Favorable);
 * `exculpado` indica que estuvo en ventana entonces pero el expediente acabó
 * exculpado (decisión de producto: proveedor válido).
 */
export interface Verdict69b {
  vigente: Sat69bStatus | null;
  exculpado: boolean;
  ventana: { from: string; to: string | null } | null;
  expediente: number | null;
}

/**
 * Respuesta simplificada para consulta de status.
 * `record` mantiene la forma plana histórica; `expedientes`, `asOf` y
 * `verdict69b` son aditivos (solo con ?asOf=).
 */
export interface StatusResponse {
  rfc: string;
  found: boolean;
  status: Sat69bStatus | null;
  nombre?: string;
  record?: LegacyRecordView;
  expedientes?: Expediente[];
  asOf?: string;
  verdict69b?: Verdict69b;
}

/**
 * Estados posibles del proceso de sincronización.
 */
export enum SyncStatus {
  SUCCESS = "success",
  FAILED = "failed",
  SKIPPED = "skipped",
}

/**
 * Metadatos del último sync.
 */
export interface SyncMetadata {
  lastSyncAt: string;
  rowCount: number;
  csvHash: string;
  csvSize: number;
  syncDuration: number;
  status: SyncStatus;
  errorMessage?: string;
  /** Fecha de corte declarada por el SAT en el preámbulo del CSV (ISO). */
  dataCutDate?: string | null;
  /** Filas descartadas por RFC inválido (censura judicial, etc.). */
  skippedInvalidRfc?: number;
}

/**
 * Resultado de una operación de sync.
 */
export interface SyncResult {
  success: boolean;
  message: string;
  rowCount?: number;
  duration?: number;
  skipped?: boolean;
  error?: string;
}

/**
 * Constantes de redis keys.
 */
export const REDIS_KEYS = {
  PREFIX: "sat69b:",
  METADATA: "sat69b:_meta",
} as const;

/**
 * Columnas del CSV del SAT (índices 0-based).
 * Columna 0 es "No" (número de fila), ignorada.
 */
export const CSV_COLUMNS = {
  NO: 0, // ignorado
  RFC: 1,
  NOMBRE: 2,
  SITUACION: 3,
  // presunción
  PRESUNCION_OFICIO_SAT: 4,
  PRESUNCION_FECHA_SAT: 5,
  PRESUNCION_OFICIO_DOF: 6,
  PRESUNCION_FECHA_DOF: 7,
  // desvirtuado
  DESVIRTUADO_OFICIO_SAT: 8,
  DESVIRTUADO_FECHA_SAT: 9,
  DESVIRTUADO_OFICIO_DOF: 10,
  DESVIRTUADO_FECHA_DOF: 11,
  // definitivo
  DEFINITIVO_OFICIO_SAT: 12,
  DEFINITIVO_FECHA_SAT: 13,
  DEFINITIVO_OFICIO_DOF: 14,
  DEFINITIVO_FECHA_DOF: 15,
  // sentencia favorable
  SENTENCIA_OFICIO_SAT: 16,
  SENTENCIA_FECHA_SAT: 17,
  SENTENCIA_OFICIO_DOF: 18,
  SENTENCIA_FECHA_DOF: 19,
} as const;
