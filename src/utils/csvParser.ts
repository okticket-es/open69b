/**
 * Parser del CSV de la lista 69-B del SAT.
 */

import { parse } from "csv-parse/sync";
import {
  ProcessStep,
  Sat69bEntry,
  Sat69bRecord,
  Sat69bStatus,
  CSV_COLUMNS,
  worstSituacion,
} from "./types";
import { isValidRfc, normalizeRfc } from "./rfcValidator";

/**
 * Mapa de strings del CSV a valores del enum Sat69bStatus.
 */
const STATUS_MAP: Record<string, Sat69bStatus> = {
  Presunto: Sat69bStatus.PRESUNTO,
  Definitivo: Sat69bStatus.DEFINITIVO,
  Desvirtuado: Sat69bStatus.DESVIRTUADO,
  "Sentencia Favorable": Sat69bStatus.SENTENCIA_FAVORABLE,
};

/**
 * Convierte el string de situación del CSV al enum Sat69bStatus.
 */
function parseStatus(value: string | null): Sat69bStatus | null {
  if (!value) return null;
  return STATUS_MAP[value] ?? null;
}

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
 * Parsea una fila del CSV a un expediente con RFC y nombre.
 */
function parseRow(row: string[]): Sat69bEntry | null {
  const rfcRaw = cleanValue(row[CSV_COLUMNS.RFC]);
  if (!rfcRaw) return null;

  // normalizar SIEMPRE: la key de Redis y la consulta usan mayúsculas,
  // y isValidRfc acepta minúsculas que de otro modo serían inconsultables
  const rfc = normalizeRfc(rfcRaw);

  const situacion = parseStatus(cleanValue(row[CSV_COLUMNS.SITUACION]));

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
 * Resultado del parseo del CSV completo.
 */
export interface ParseResult {
  /** Filas de datos válidas (una por expediente). */
  entries: Sat69bEntry[];
  /** Registros agregados por RFC (lo que se persiste). */
  records: Sat69bRecord[];
  /** Filas descartadas por RFC inválido (censura judicial, cabeceras embebidas). */
  skippedInvalidRfc: number;
  /** Fecha de corte del preámbulo ("actualizada al ...") en ISO, si existe. */
  dataCutDate: string | null;
}

const MESES_ES: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

/**
 * Extrae la fecha de corte del preámbulo del CSV:
 * "Información actualizada al 31 de diciembre de 2025" -> "2025-12-31".
 */
export function parseCutDate(preambleRows: string[][]): string | null {
  for (const row of preambleRows) {
    const text = row.join(" ");
    const m =
      /actualizada\s+al\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i.exec(
        text,
      );
    if (m) {
      const month = MESES_ES[m[2].toLowerCase()];
      if (!month) {
        return null;
      }
      return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Localiza la fila de cabecera por contenido (col 0 = "No", col 1 = "RFC").
 * El preámbulo real del SAT son 3 filas, pero se detecta por contenido
 * para sobrevivir a cambios de formato.
 */
function findHeaderIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    if (rows[i][0]?.trim() === "No" && rows[i][1]?.trim() === "RFC") {
      return i;
    }
  }
  throw new Error("No se encontró la cabecera del CSV 69-B (columnas No,RFC)");
}

/**
 * Agrupa las filas por RFC; nombre = el del primer expediente con nombre.
 */
export function aggregateByRfc(entries: Sat69bEntry[]): Sat69bRecord[] {
  const byRfc = new Map<string, Sat69bRecord>();
  for (const { rfc, nombre, ...expediente } of entries) {
    const existing = byRfc.get(rfc);
    if (existing) {
      existing.expedientes.push(expediente);
      if (!existing.nombre && nombre) {
        existing.nombre = nombre;
      }
    } else {
      byRfc.set(rfc, {
        rfc,
        nombre,
        situacion: null,
        expedientes: [expediente],
      });
    }
  }
  const records = Array.from(byRfc.values());
  for (const r of records) {
    r.situacion = worstSituacion(r.expedientes);
  }
  return records;
}

/**
 * Parsea el contenido completo del CSV y retorna los registros válidos.
 *
 * @param csvContent - Contenido del CSV como string
 * @returns Filas, agregados por RFC, descartes y fecha de corte
 */
export function parseCsv(csvContent: string): ParseResult {
  const rows = parse(csvContent, {
    encoding: "utf-8",
    relaxColumnCount: true,
    skipEmptyLines: true,
  }) as string[][];

  const headerIdx = findHeaderIndex(rows);
  const dataRows = rows.slice(headerIdx + 1);

  const entries: Sat69bEntry[] = [];
  let skippedInvalidRfc = 0;
  for (const row of dataRows) {
    const entry = parseRow(row);
    if (!entry) {
      continue;
    }
    // descarta censura judicial (XXXXXXXXXXXX) y cabeceras repetidas embebidas
    if (!isValidRfc(entry.rfc)) {
      skippedInvalidRfc++;
      continue;
    }
    entries.push(entry);
  }

  return {
    entries,
    records: aggregateByRfc(entries),
    skippedInvalidRfc,
    dataCutDate: parseCutDate(rows.slice(0, headerIdx)),
  };
}

/**
 * Calcula el hash SHA256 (para detectar cambios en el CSV).
 * Con bytes crudos no re-codifica: el hash es del fichero tal cual.
 */
export async function calculateHash(
  content: string | ArrayBuffer | Uint8Array,
): Promise<string> {
  const data: BufferSource =
    typeof content === "string"
      ? new TextEncoder().encode(content)
      : (content as BufferSource);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
