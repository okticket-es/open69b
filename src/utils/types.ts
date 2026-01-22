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
 * Registro completo de un contribuyente en la lista 69-B.
 */
export interface Sat69bRecord {
  rfc: string;
  nombre: string;
  situacion: Sat69bStatus | null;
  presuncion: ProcessStep;
  desvirtuado: ProcessStep;
  definitivo: ProcessStep;
  sentenciaFavorable: ProcessStep;
}

/**
 * Respuesta simplificada para consulta de status.
 */
export interface StatusResponse {
  rfc: string;
  found: boolean;
  status: Sat69bStatus | null;
  nombre?: string;
  record?: Sat69bRecord;
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
