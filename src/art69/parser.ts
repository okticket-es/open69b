/**
 * Parser genérico de las 14 listas del artículo 69: una sola función que
 * lee cualquiera de las listas según su Art69ListConfig (columnas por
 * nombre, no por índice fijo — el SAT varía el orden entre ficheros).
 */

import { parse } from "csv-parse/sync";
import { isValidRfc, normalizeRfc } from "@/utils/rfcValidator";
import { parseSatDate } from "@/utils/dates";
import { findColumnIndex } from "./columnMatcher";
import { Art69Entry, Art69ListConfig } from "./types";

/** Convierte "1,390,273" o vacío a número; null si no hay valor numérico. */
function parseMonto(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/["\s,]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Fecha de una fila: dd/mm/yyyy normal, o solo año → 1 de enero de ese año. */
function parseFecha(raw: string | undefined, soloAnio: boolean): string | null {
  if (!raw) return null;
  if (soloAnio) {
    const anio = raw.trim();
    return /^\d{4}$/.test(anio) ? `${anio}-01-01` : null;
  }
  return parseSatDate(raw);
}

export interface ParsedArt69Row {
  rfc: string;
  nombre: string;
  entry: Art69Entry;
}

export interface ParseArt69Result {
  entries: ParsedArt69Row[];
  skippedInvalidRfc: number;
}

/**
 * Extrae solo el conjunto de RFCs de un CSV (sin construir Art69Entry por
 * fila). Se usa para el snapshot ANTERIOR en el diff de listas de estado:
 * ahí solo hace falta el Set de RFCs, no el resto de columnas — evitar
 * construir miles de objetos completos reduce el pico de memoria cuando
 * el CSV actual (con sus propias entries ya en memoria) y el anterior
 * coinciden en la misma iteración del sync (Firmes/No_localizados llegan
 * a cientos de miles de filas).
 */
export function extractRfcs(
  csvContent: string,
  config: Art69ListConfig,
): Set<string> {
  const rows = parse(csvContent, {
    relaxColumnCount: true,
    skipEmptyLines: true,
  }) as string[][];

  if (rows.length === 0) return new Set();

  const header = rows[0];
  const rfcIdx = findColumnIndex(header, config.rfcColumn);
  if (rfcIdx === -1) {
    throw new Error(
      `art69[${config.id}]: no se encontró columna RFC en la cabecera: ${header.join(",")}`,
    );
  }

  const rfcs = new Set<string>();
  for (const row of rows.slice(1)) {
    const rfcRaw = row[rfcIdx]?.trim();
    if (!rfcRaw) continue;
    const rfc = normalizeRfc(rfcRaw);
    if (isValidRfc(rfc)) rfcs.add(rfc);
  }
  return rfcs;
}

export function parseArt69Csv(
  csvContent: string,
  config: Art69ListConfig,
): ParseArt69Result {
  const rows = parse(csvContent, {
    relaxColumnCount: true,
    skipEmptyLines: true,
  }) as string[][];

  if (rows.length === 0) {
    return { entries: [], skippedInvalidRfc: 0 };
  }

  const header = rows[0];
  const rfcIdx = findColumnIndex(header, config.rfcColumn);
  const nombreIdx = findColumnIndex(header, config.nombreColumn);
  const supuestoIdx = config.supuestoColumn
    ? findColumnIndex(header, config.supuestoColumn)
    : -1;
  const fechaIdx = findColumnIndex(header, config.fechaColumn);
  const montoIdx = config.montoColumn
    ? findColumnIndex(header, config.montoColumn)
    : -1;
  const entidadIdx = config.entidadColumn
    ? findColumnIndex(header, config.entidadColumn)
    : -1;

  if (rfcIdx === -1 || fechaIdx === -1) {
    throw new Error(
      `art69[${config.id}]: no se encontró columna RFC o fecha en la cabecera: ${header.join(",")}`,
    );
  }

  const entries: ParsedArt69Row[] = [];
  let skippedInvalidRfc = 0;

  for (const row of rows.slice(1)) {
    const rfcRaw = row[rfcIdx]?.trim();
    if (!rfcRaw) continue;
    const rfc = normalizeRfc(rfcRaw);
    if (!isValidRfc(rfc)) {
      skippedInvalidRfc++;
      continue;
    }

    const supuesto =
      config.fixedSupuesto ??
      (supuestoIdx !== -1
        ? row[supuestoIdx]?.trim().toUpperCase()
        : undefined) ??
      "DESCONOCIDO";

    entries.push({
      rfc,
      nombre: (nombreIdx !== -1 ? row[nombreIdx]?.trim() : "") || "",
      entry: {
        listaId: config.id,
        family: config.family,
        supuesto,
        fecha: parseFecha(row[fechaIdx], config.soloAnio),
        monto: montoIdx !== -1 ? parseMonto(row[montoIdx]) : null,
        entidadFederativa:
          entidadIdx !== -1 ? row[entidadIdx]?.trim() || null : null,
        esResolucion: config.esResolucion,
      },
    });
  }

  return { entries, skippedInvalidRfc };
}
