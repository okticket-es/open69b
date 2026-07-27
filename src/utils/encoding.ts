export type CsvEncoding = "utf-8" | "windows-1252";

/**
 * Decodificación de los CSV del SAT: vienen en windows-1252,
 * pero se intenta UTF-8 estricto primero por si el SAT migra.
 * Devuelve también el encoding usado (para etiquetar backups).
 */
export function decodeCsv(buffer: ArrayBuffer | Uint8Array): {
  content: string;
  encoding: CsvEncoding;
} {
  try {
    return {
      content: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
      encoding: "utf-8",
    };
  } catch {
    return {
      content: new TextDecoder("windows-1252").decode(buffer),
      encoding: "windows-1252",
    };
  }
}

/** Variante que devuelve solo el contenido decodificado. */
export function decodeCsvBuffer(buffer: ArrayBuffer | Uint8Array): string {
  return decodeCsv(buffer).content;
}
