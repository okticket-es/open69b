/**
 * Servicio de operaciones Redis para la lista 69-B.
 */

import { Redis } from "@miermontoto/redis";
import { Sat69bRecord, SyncMetadata, REDIS_KEYS } from "@/utils/types";

// singleton instance
const redis = Redis.getInstance();

/**
 * Obtiene un registro por RFC.
 */
export async function getRecordByRfc(
  rfc: string,
): Promise<Sat69bRecord | null> {
  const key = `${REDIS_KEYS.PREFIX}${rfc}`;
  return await redis.getJson<Sat69bRecord>(key);
}

/**
 * Guarda un registro en Redis.
 */
export async function setRecord(record: Sat69bRecord): Promise<void> {
  const key = `${REDIS_KEYS.PREFIX}${record.rfc}`;
  await redis.setJson(key, record);
}

/**
 * Sincroniza múltiples registros usando pipeline (bulk insert).
 */
export async function bulkSetRecords(records: Sat69bRecord[]): Promise<number> {
  const client = redis.getClient();
  const pipeline = client.pipeline();

  for (const record of records) {
    const key = `${REDIS_KEYS.PREFIX}${record.rfc}`;
    pipeline.set(key, JSON.stringify(record));
  }

  await pipeline.exec();
  return records.length;
}

/**
 * Elimina todos los registros sat69b (excepto metadata).
 */
export async function clearAllRecords(): Promise<number> {
  const keys = await redis.scan({ pattern: `${REDIS_KEYS.PREFIX}*` });
  const recordKeys = keys.filter((k) => k !== REDIS_KEYS.METADATA);

  if (recordKeys.length > 0) {
    await redis.del(...recordKeys);
  }

  return recordKeys.length;
}

/**
 * Obtiene los metadatos del último sync.
 */
export async function getMetadata(): Promise<SyncMetadata | null> {
  return await redis.getJson<SyncMetadata>(REDIS_KEYS.METADATA);
}

/**
 * Guarda los metadatos del sync.
 */
export async function setMetadata(metadata: SyncMetadata): Promise<void> {
  await redis.setJson(REDIS_KEYS.METADATA, metadata);
}

/**
 * Verifica si Redis está disponible.
 */
export async function healthCheck(): Promise<boolean> {
  return await redis.ping();
}

/**
 * Cuenta el número de registros en Redis.
 */
export async function countRecords(): Promise<number> {
  const keys = await redis.scan({ pattern: `${REDIS_KEYS.PREFIX}*` });
  return keys.filter((k) => k !== REDIS_KEYS.METADATA).length;
}
