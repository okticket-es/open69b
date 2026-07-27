/**
 * Parseo tolerante de las fechas de publicación del CSV 69-B del SAT.
 *
 * El 99,7% de las celdas son "dd/mm/yyyy", pero hay ~185 anomalías reales:
 * pares "fecha1 - fecha2" (procedimientos múltiples), años de 2 dígitos,
 * separador guion, dobles espacios y seriales de Excel crudos.
 * En pares/triples se toma la PRIMERA fecha (la más reciente en el CSV).
 */

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function fromParts(d: number, m: number, y: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseSatDate(value: string | null): string | null {
  if (!value) return null;

  // primera fecha dd/mm/yyyy | dd-mm-yyyy (año de 2 o 4 dígitos) que aparezca
  const m = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(value);
  if (m) return fromParts(Number(m[1]), Number(m[2]), Number(m[3]));

  // serial de Excel (días desde 1899-12-30), visto en celdas '44014'/'44029'
  const serial = /^\s*(\d{5})\s*$/.exec(value);
  if (serial) {
    const n = Number(serial[1]);
    if (n >= 30000 && n <= 60000) {
      return new Date(EXCEL_EPOCH_MS + n * 86_400_000)
        .toISOString()
        .slice(0, 10);
    }
  }

  return null;
}
