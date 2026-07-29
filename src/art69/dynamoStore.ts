/**
 * Persistencia del timeline del artículo 69 en DynamoDB: un item por RFC
 * (no Redis — ~700k RFCs no caben con holgura en el cache.t4g.micro actual).
 *
 * El write hace merge con lo que ya hubiera (BatchGet + unión deduplicada +
 * BatchWrite) para no perder entradas de "estado" cuando un RFC sale de una
 * lista (deja de aparecer en el CSV). Se usa BatchGet/BatchWrite (hasta 100
 * y 25 claves por llamada respectivamente) en vez de Get/Put individuales
 * para mantener el número de round-trips manejable a la escala real
 * (~600k RFCs) dentro de la VPC (NAT de por medio hasta que haya Gateway
 * Endpoints — ver serverless.yml).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  BatchWriteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { Art69Entry, Art69Record } from "./types";

const TABLE_NAME = process.env.ART69_TABLE_NAME || "open69b-art69-prod";
const ENDPOINT = process.env.DYNAMODB_ENDPOINT; // solo en local/tests

const client = new DynamoDBClient(ENDPOINT ? { endpoint: ENDPOINT } : {});
const doc = DynamoDBDocumentClient.from(client);

const GET_BATCH_SIZE = 100; // límite de BatchGetItem
const WRITE_BATCH_SIZE = 25; // límite de BatchWriteItem
const CONCURRENCY = 8;
const MAX_RETRIES = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Clave de deduplicación de una entrada: dos entries con la misma clave se
 * consideran "el mismo hecho" (re-derivado de un CSV acumulativo o de una
 * entrada de estado que sigue vigente) y no se duplican.
 */
function entryKey(e: Art69Entry): string {
  return [
    e.listaId,
    e.family,
    e.supuesto,
    e.fecha,
    e.esSalidaPorDiff ? "1" : "0",
  ].join("|");
}

/**
 * Fusiona el record de este sync con lo que ya hubiera en Dynamo: unión
 * deduplicada de entries. Es lo que preserva la trazabilidad histórica —
 * una entrada de "estado" (p.ej. FIRMES) deja de aparecer en el CSV en
 * cuanto el RFC sale de la lista, así que sin esta fusión se perdería.
 */
function mergeWithExisting(
  existing: Art69Record | null,
  incoming: Art69Record,
): Art69Record {
  if (!existing) return incoming;
  const seen = new Set(existing.entries.map(entryKey));
  const entries = [...existing.entries];
  for (const e of incoming.entries) {
    const key = entryKey(e);
    if (!seen.has(key)) {
      entries.push(e);
      seen.add(key);
    }
  }
  return {
    rfc: incoming.rfc,
    nombre: incoming.nombre || existing.nombre,
    entries,
  };
}

/**
 * Busca los records ya existentes para un conjunto de RFCs (BatchGetItem,
 * con reintento de UnprocessedKeys). Si el lote entero falla (excepción
 * dura, no solo claves no procesadas), se trata como "sin datos previos"
 * para ESE lote en vez de abortar el sync completo: el peor caso es perder
 * la fusión de un puñado de RFCs en un sync puntual, no todos los demás.
 */
async function batchGetExisting(
  rfcs: string[],
): Promise<Map<string, Art69Record>> {
  const found = new Map<string, Art69Record>();
  if (rfcs.length === 0) return found;

  async function fetchWithRetry(keys: string[], attempt = 1): Promise<void> {
    if (keys.length === 0) return;
    try {
      const result = await doc.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLE_NAME]: { Keys: keys.map((rfc) => ({ rfc })) },
          },
        }),
      );
      for (const item of result.Responses?.[TABLE_NAME] ?? []) {
        const record = item as Art69Record;
        found.set(record.rfc, record);
      }
      const unprocessed = result.UnprocessedKeys?.[TABLE_NAME]?.Keys;
      if (unprocessed && unprocessed.length > 0 && attempt <= MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, attempt * 200));
        await fetchWithRetry(
          unprocessed.map((k) => k.rfc as string),
          attempt + 1,
        );
      } else if (unprocessed && unprocessed.length > 0) {
        console.error(
          `art69 batchGetExisting: ${unprocessed.length} claves sin procesar tras ${MAX_RETRIES} reintentos`,
        );
      }
    } catch (err) {
      console.error(
        `art69 batchGetExisting: fallo en lote de ${keys.length} RFCs, se tratan como sin datos previos: ${(err as Error).message}`,
      );
    }
  }

  const chunks = chunk(rfcs, GET_BATCH_SIZE);
  let index = 0;
  async function worker(): Promise<void> {
    while (index < chunks.length) {
      await fetchWithRetry(chunks[index++]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker),
  );
  return found;
}

/**
 * Escribe un lote (máx. 25) con reintento de UnprocessedItems. Devuelve los
 * records que quedaron SIN escribir tras agotar los reintentos (nunca los
 * cuenta como escritos: quien llama debe registrar el fallo, no ocultarlo).
 */
async function writeBatchWithRetry(
  batch: Art69Record[],
  attempt = 1,
): Promise<Art69Record[]> {
  if (batch.length === 0) return [];
  let result;
  try {
    result = await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((record) => ({
            PutRequest: {
              Item: { ...record, updatedAt: new Date().toISOString() },
            },
          })),
        },
      }),
    );
  } catch (err) {
    console.error(
      `art69 writeBatchWithRetry: fallo en lote de ${batch.length} records: ${(err as Error).message}`,
    );
    return batch; // todo el lote queda sin escribir
  }

  const unprocessed = result.UnprocessedItems?.[TABLE_NAME];
  if (!unprocessed || unprocessed.length === 0) return [];

  const retryRecords = unprocessed
    .map((u) => u.PutRequest?.Item as Art69Record | undefined)
    .filter((r): r is Art69Record => r !== undefined);

  if (attempt <= MAX_RETRIES) {
    await new Promise((r) => setTimeout(r, attempt * 200));
    return writeBatchWithRetry(retryRecords, attempt + 1);
  }

  console.error(
    `art69 writeBatchWithRetry: ${retryRecords.length} records SIN ESCRIBIR tras ${MAX_RETRIES} reintentos (rfcs: ${retryRecords.map((r) => r.rfc).join(",")})`,
  );
  return retryRecords;
}

/**
 * Escribe records en lotes, fusionando cada uno con su estado previo en
 * Dynamo (BatchGet + merge antes del BatchWrite). Nunca cuenta como
 * "written" un record que en realidad falló tras agotar los reintentos.
 */
export async function putArt69Records(
  records: Art69Record[],
): Promise<{ written: number; failed: number }> {
  if (records.length === 0) return { written: 0, failed: 0 };

  const existingByRfc = await batchGetExisting(records.map((r) => r.rfc));
  const merged = records.map((r) =>
    mergeWithExisting(existingByRfc.get(r.rfc) ?? null, r),
  );

  const writeChunks = chunk(merged, WRITE_BATCH_SIZE);
  let index = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    while (index < writeChunks.length) {
      const batch = writeChunks[index++];
      const notWritten = await writeBatchWithRetry(batch);
      failed += notWritten.length;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, writeChunks.length) }, worker),
  );

  return { written: merged.length - failed, failed };
}

export async function getArt69Record(rfc: string): Promise<Art69Record | null> {
  const result = await doc.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { rfc } }),
  );
  return (result.Item as Art69Record | undefined) ?? null;
}
