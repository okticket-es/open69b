/**
 * Servicio de operaciones Redis para la lista 69-B.
 */

import { getRedisClient } from "./redisClient";
import { Sat69bRecord, SyncMetadata, REDIS_KEYS } from "@sat69b/utils/types";

/**
 * Obtiene un registro por RFC.
 *
 * @param rfc - RFC normalizado
 * @returns Registro o null si no existe
 */
export async function getRecordByRfc(
  rfc: string,
): Promise<Sat69bRecord | null> {
  const redis = getRedisClient();
  const key = `${REDIS_KEYS.PREFIX}${rfc}`;
  const data = await redis.get(key);

  if (!data) return null;

  try {
    return JSON.parse(data) as Sat69bRecord;
  } catch {
    console.error(`Error parsing record for RFC ${rfc}`);
    return null;
  }
}

/**
 * Guarda un registro en Redis.
 *
 * @param record - Registro a guardar
 */
export async function setRecord(record: Sat69bRecord): Promise<void> {
  const redis = getRedisClient();
  const key = `${REDIS_KEYS.PREFIX}${record.rfc}`;
  await redis.set(key, JSON.stringify(record));
}

/**
 * Sincroniza múltiples registros usando pipeline (bulk insert).
 *
 * @param records - Array de registros a insertar
 * @returns Número de registros insertados
 */
export async function bulkSetRecords(records: Sat69bRecord[]): Promise<number> {
  const redis = getRedisClient();
  const pipeline = redis.pipeline();

  for (const record of records) {
    const key = `${REDIS_KEYS.PREFIX}${record.rfc}`;
    pipeline.set(key, JSON.stringify(record));
  }

  await pipeline.exec();
  return records.length;
}

/**
 * Elimina todos los registros sat69b (excepto metadata).
 * Útil para resync completo.
 */
export async function clearAllRecords(): Promise<number> {
  const redis = getRedisClient();
  let cursor = "0";
  let deletedCount = 0;

  do {
    const [newCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      `${REDIS_KEYS.PREFIX}*`,
      "COUNT",
      1000,
    );
    cursor = newCursor;

    // filtrar el key de metadata
    const recordKeys = keys.filter((k) => k !== REDIS_KEYS.METADATA);

    if (recordKeys.length > 0) {
      await redis.del(...recordKeys);
      deletedCount += recordKeys.length;
    }
  } while (cursor !== "0");

  return deletedCount;
}

/**
 * Obtiene los metadatos del último sync.
 */
export async function getMetadata(): Promise<SyncMetadata | null> {
  const redis = getRedisClient();
  const data = await redis.get(REDIS_KEYS.METADATA);

  if (!data) return null;

  try {
    return JSON.parse(data) as SyncMetadata;
  } catch {
    console.error("Error parsing sync metadata");
    return null;
  }
}

/**
 * Guarda los metadatos del sync.
 */
export async function setMetadata(metadata: SyncMetadata): Promise<void> {
  const redis = getRedisClient();
  await redis.set(REDIS_KEYS.METADATA, JSON.stringify(metadata));
}

/**
 * Verifica si Redis está disponible.
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/**
 * Cuenta el número de registros en Redis (aproximado via scan).
 */
export async function countRecords(): Promise<number> {
  const redis = getRedisClient();
  let cursor = "0";
  let count = 0;

  do {
    const [newCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      `${REDIS_KEYS.PREFIX}*`,
      "COUNT",
      1000,
    );
    cursor = newCursor;
    // excluir metadata key
    count += keys.filter((k) => k !== REDIS_KEYS.METADATA).length;
  } while (cursor !== "0");

  return count;
}
