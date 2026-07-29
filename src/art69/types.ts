/**
 * Tipos para el artículo 69 del CFF (listas de "morosos" del SAT).
 */

export type Art69Family = "estado" | "evento";

/**
 * Configuración declarativa de una de las 14 listas del artículo 69.
 * Las columnas se referencian por nombre (case/acento-insensitive, ver
 * columnMatcher.ts) porque el SAT no es consistente entre ficheros.
 */
export interface Art69ListConfig {
  id: string;
  url: string;
  family: Art69Family;
  rfcColumn: string;
  nombreColumn: string;
  supuestoColumn?: string;
  fixedSupuesto?: string;
  fechaColumn: string;
  montoColumn?: string;
  entidadColumn?: string;
  /** true si esta lista CIERRA un supuesto de "estado" previo (cancelados, condonados...). */
  esResolucion: boolean;
  /** true si la fuente solo da el año (no fecha completa): fecha = 1 de enero de ese año. */
  soloAnio: boolean;
}

/** Una entrada del timeline de un RFC en una lista concreta. */
export interface Art69Entry {
  listaId: string;
  family: Art69Family;
  supuesto: string;
  fecha: string | null; // ISO YYYY-MM-DD
  monto: number | null;
  entidadFederativa: string | null;
  esResolucion: boolean;
  /** true si esta entrada es una salida INFERIDA por diff (no viene del CSV). */
  esSalidaPorDiff?: boolean;
}

/** El timeline completo de un RFC, agregado entre todas las listas donde aparece. */
export interface Art69Record {
  rfc: string;
  nombre: string;
  entries: Art69Entry[];
}
