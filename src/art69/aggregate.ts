/**
 * Agregación por RFC entre listas del artículo 69, y detección de salidas
 * inferidas por diff (para las listas "estado", que no traen fecha de salida).
 */

import { Art69Entry, Art69Record } from "./types";
import { ParsedArt69Row } from "./parser";

export function aggregateArt69ByRfc(
  rows: ParsedArt69Row[],
): Map<string, Art69Record> {
  const byRfc = new Map<string, Art69Record>();
  for (const { rfc, nombre, entry } of rows) {
    const existing = byRfc.get(rfc);
    if (existing) {
      existing.entries.push(entry);
      if (!existing.nombre && nombre) existing.nombre = nombre;
    } else {
      byRfc.set(rfc, { rfc, nombre, entries: [entry] });
    }
  }
  return byRfc;
}

export interface ExitRow {
  rfc: string;
  entry: Art69Entry;
}

/**
 * RFCs presentes en el snapshot anterior y ausentes en el actual: salida
 * inferida (el SAT no publica una lista de "eliminados" del artículo 69).
 */
export function detectExits(
  previousRfcs: Set<string>,
  currentRfcs: Set<string>,
  listaId: string,
  snapshotDate: string,
): ExitRow[] {
  const salidas: ExitRow[] = [];
  for (const rfc of previousRfcs) {
    if (!currentRfcs.has(rfc)) {
      salidas.push({
        rfc,
        entry: {
          listaId,
          family: "estado",
          supuesto: "ELIMINADO",
          fecha: snapshotDate,
          monto: null,
          entidadFederativa: null,
          esResolucion: true,
          esSalidaPorDiff: true,
        },
      });
    }
  }
  return salidas;
}
