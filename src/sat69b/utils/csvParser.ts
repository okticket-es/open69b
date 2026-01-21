/**
 * Parser del CSV de la lista 69-B del SAT.
 */

import { parse } from "csv-parse/sync";
import { Sat69bRecord, ProcessStep, Sat69bStatus, CSV_COLUMNS } from "./types";

/**
 * Número de filas de encabezado/info a saltar (el CSV tiene 2 filas iniciales de metadata).
 */
const HEADER_ROWS_TO_SKIP = 2;

/**
 * Limpia un valor de celda, retornando null si está vacío.
 */
function cleanValue(value: string | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Extrae un ProcessStep de una fila del CSV.
 */
function extractProcessStep(row: string[], oficioSatIdx: number): ProcessStep {
  return {
    oficioSat: cleanValue(row[oficioSatIdx]),
    fechaSat: cleanValue(row[oficioSatIdx + 1]),
    oficioDof: cleanValue(row[oficioSatIdx + 2]),
    fechaDof: cleanValue(row[oficioSatIdx + 3]),
  };
}

/**
 * Parsea una fila del CSV a un registro Sat69bRecord.
 */
function parseRow(row: string[]): Sat69bRecord | null {
  const rfc = cleanValue(row[CSV_COLUMNS.RFC]);
  if (!rfc) return null;

  const situacion = cleanValue(row[CSV_COLUMNS.SITUACION]) as Sat69bStatus;

  return {
    rfc,
    nombre: cleanValue(row[CSV_COLUMNS.NOMBRE]) || "",
    situacion,
    presuncion: extractProcessStep(row, CSV_COLUMNS.PRESUNCION_OFICIO_SAT),
    desvirtuado: extractProcessStep(row, CSV_COLUMNS.DESVIRTUADO_OFICIO_SAT),
    definitivo: extractProcessStep(row, CSV_COLUMNS.DEFINITIVO_OFICIO_SAT),
    sentenciaFavorable: extractProcessStep(
      row,
      CSV_COLUMNS.SENTENCIA_OFICIO_SAT,
    ),
  };
}

/**
 * Parsea el contenido completo del CSV y retorna los registros válidos.
 *
 * @param csvContent - Contenido del CSV como string
 * @returns Array de registros parseados
 */
export function parseCsv(csvContent: string): Sat69bRecord[] {
  const rows = parse(csvContent, {
    encoding: "utf-8",
    relaxColumnCount: true,
    skipEmptyLines: true,
  }) as string[][];

  // saltar filas de encabezado
  const dataRows = rows.slice(HEADER_ROWS_TO_SKIP);

  const records: Sat69bRecord[] = [];
  for (const row of dataRows) {
    const record = parseRow(row);
    if (record) {
      records.push(record);
    }
  }

  return records;
}

/**
 * Calcula el hash SHA256 de un string (para detectar cambios en el CSV).
 */
export async function calculateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
