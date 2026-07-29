/**
 * Matching de columnas del artículo 69 por nombre: el SAT no es consistente
 * entre ficheros (acentos, mayúsculas, espacios sueltos como " MONTO ").
 */

/** Normaliza un nombre de columna: sin acentos, mayúsculas, un solo espacio. */
export function normalizeColumnName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** Índice de una columna por nombre (case/acento-insensitive), -1 si no existe. */
export function findColumnIndex(header: string[], columnName: string): number {
  const target = normalizeColumnName(columnName);
  return header.findIndex((h) => normalizeColumnName(h) === target);
}
