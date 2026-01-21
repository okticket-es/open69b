/**
 * Validación y normalización de RFC mexicano.
 */

/**
 * Patrón RFC persona física: 4 letras + 6 dígitos (fecha) + 3 homoclave.
 * Patrón RFC persona moral: 3 letras + 6 dígitos (fecha) + 3 homoclave.
 */
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

/**
 * Valida si un string tiene formato de RFC válido.
 *
 * @param rfc - RFC a validar
 * @returns true si el formato es válido
 */
export function isValidRfc(rfc: string): boolean {
  if (!rfc || typeof rfc !== "string") return false;
  const normalized = normalizeRfc(rfc);
  return RFC_PATTERN.test(normalized);
}

/**
 * Normaliza un RFC a mayúsculas y sin espacios.
 *
 * @param rfc - RFC a normalizar
 * @returns RFC normalizado
 */
export function normalizeRfc(rfc: string): string {
  if (!rfc || typeof rfc !== "string") return "";
  return rfc.trim().toUpperCase();
}

/**
 * Valida y normaliza un RFC, lanzando error si es inválido.
 *
 * @param rfc - RFC a validar
 * @returns RFC normalizado
 * @throws Error si el RFC es inválido
 */
export function validateAndNormalizeRfc(rfc: string): string {
  const normalized = normalizeRfc(rfc);
  if (!isValidRfc(normalized)) {
    throw new Error(`RFC inválido: ${rfc}`);
  }
  return normalized;
}
