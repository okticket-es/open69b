/**
 * Orquestador del sync del artículo 69: descarga las 14 listas, detecta
 * salidas por diff en las de "estado", fusiona por RFC entre listas y
 * persiste en DynamoDB. No bloquea nada — solo detecta y traza (Hito 2).
 *
 * Skip por hash: el SAT actualiza ~trimestral, así que una lista cuyo
 * contenido no cambió desde el último sync no se re-parsea ni re-escribe
 * (ahorra ~600k escrituras diarias idénticas a DynamoDB). El hash por
 * lista se persiste en el item "_meta" de la propia tabla, que además da
 * visibilidad del último sync (expuesto en /metadata).
 */

import { ART69_LISTS } from "@/art69/listConfigs";
import { extractRfcs, parseArt69Csv } from "@/art69/parser";
import { aggregateArt69ByRfc, detectExits } from "@/art69/aggregate";
import { readPreviousSnapshot, writeSnapshot } from "@/art69/snapshotStore";
import {
  Art69SyncMeta,
  getArt69Meta,
  putArt69Meta,
  putArt69Records,
} from "@/art69/dynamoStore";
import { calculateHash } from "@/utils/csvParser";
import { decodeCsvBuffer } from "@/utils/encoding";
import { Art69Record } from "@/art69/types";

export interface Art69SyncResult {
  listasOk: number;
  listasFallidas: string[];
  listasSinCambios: number;
  rfcsTotal: number;
  rfcsEscritos: number;
  rfcsFallidos: number;
  duration: number;
}

async function downloadList(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} descargando ${url}`);
  }
  return decodeCsvBuffer(new Uint8Array(await response.arrayBuffer()));
}

function mergeInto(
  target: Map<string, Art69Record>,
  source: Map<string, Art69Record>,
): void {
  for (const [rfc, record] of source) {
    const existing = target.get(rfc);
    if (existing) {
      existing.entries.push(...record.entries);
      if (!existing.nombre && record.nombre) existing.nombre = record.nombre;
    } else {
      target.set(rfc, record);
    }
  }
}

export async function syncArt69(): Promise<Art69SyncResult> {
  const start = Date.now();
  const merged = new Map<string, Art69Record>();
  const listasFallidas: string[] = [];
  const snapshotDate = new Date().toISOString().slice(0, 10);

  const previousMeta = await getArt69Meta();
  const listasMeta: Art69SyncMeta["listas"] = {};
  let listasSinCambios = 0;

  for (const config of ART69_LISTS) {
    try {
      const content = await downloadList(config.url);
      const hash = await calculateHash(content);

      const previousListMeta = previousMeta?.listas?.[config.id];
      if (previousListMeta?.hash === hash) {
        // sin cambios desde el último sync: ni parseo, ni diff, ni escritura
        // (el merge en Dynamo ya conserva lo persistido anteriormente)
        listasMeta[config.id] = { ...previousListMeta, skipped: true };
        listasSinCambios++;
        continue;
      }

      const { entries } = parseArt69Csv(content, config);
      const byRfc = aggregateArt69ByRfc(entries);

      if (config.family === "estado") {
        const previous = await readPreviousSnapshot(config.id);
        if (previous) {
          // solo el conjunto de RFCs (no entries completas): el CSV actual
          // ya tiene sus propias entries en memoria en este punto del bucle
          const previousRfcs = extractRfcs(previous, config);
          const currentRfcs = new Set(entries.map((e) => e.rfc));
          const salidas = detectExits(
            previousRfcs,
            currentRfcs,
            config.id,
            snapshotDate,
          );
          for (const salida of salidas) {
            const existing = byRfc.get(salida.rfc);
            if (existing) {
              existing.entries.push(salida.entry);
            } else {
              byRfc.set(salida.rfc, {
                rfc: salida.rfc,
                nombre: "",
                entries: [salida.entry],
              });
            }
          }
        }
        // el SAT actualiza ~trimestral: sin cambios no se acumula otra
        // copia fechada idéntica en S3 (los snapshots no caducan)
        if (previous !== content) {
          try {
            await writeSnapshot(config.id, content, snapshotDate);
          } catch (err) {
            // el snapshot es infraestructura del DIFF, no de la ingesta:
            // si S3 falla, la lista se ingesta igual y el diff del día
            // siguiente usará el snapshot anterior (más antiguo pero válido)
            console.error(
              `art69Sync: fallo guardando snapshot de ${config.id} (non-critical): ${(err as Error).message}`,
            );
          }
        }
      }

      mergeInto(merged, byRfc);
      listasMeta[config.id] = { hash, rows: entries.length, skipped: false };
    } catch (err) {
      console.error(
        `art69Sync: fallo en lista ${config.id}: ${(err as Error).message}`,
      );
      listasFallidas.push(config.id);
      // conservar el hash previo (si lo hay) para que el próximo sync
      // reintente esta lista en vez de saltársela
      if (previousMeta?.listas?.[config.id]) {
        listasMeta[config.id] = previousMeta.listas[config.id];
      }
    }
  }

  if (listasFallidas.length > 0) {
    // token estable para el MetricFilter/alarma de CloudWatch — el mismo
    // patrón que SAT_DATA_STALE en el sync del 69-B
    console.error(
      `ART69_SYNC_FAILED lists=${listasFallidas.length} ids=${listasFallidas.join(",")}`,
    );
  }

  const records = Array.from(merged.values());

  // el persist NUNCA debe tirar los resultados ya calculados de las 14
  // descargas/parseos: un fallo aquí se reporta como rfcsFallidos, no
  // como una excepción que obligue a re-descargar todo desde cero
  let rfcsEscritos = 0;
  let rfcsFallidos = records.length;
  try {
    const result = await putArt69Records(records);
    rfcsEscritos = result.written;
    rfcsFallidos = result.failed;
  } catch (err) {
    console.error(
      `art69Sync: fallo persistiendo en DynamoDB: ${(err as Error).message}`,
    );
  }

  const duration = Date.now() - start;

  // si hubo escrituras fallidas, NO persistir hashes "limpios" de las
  // listas procesadas en esta pasada: el hash-skip del día siguiente se
  // saltaría la lista y los records fallidos jamás se reintentarían
  // (hasta que el SAT cambiara el fichero). Sin hash → re-proceso mañana,
  // y el merge deduplicado hace el reintento idempotente.
  if (rfcsFallidos > 0) {
    for (const [id, m] of Object.entries(listasMeta)) {
      if (!m.skipped) {
        const prev = previousMeta?.listas?.[id];
        if (prev) {
          listasMeta[id] = prev;
        } else {
          delete listasMeta[id];
        }
      }
    }
    console.error(
      `ART69_SYNC_PARTIAL rfcsFallidos=${rfcsFallidos} — hashes no actualizados para reintento`,
    );
  }

  await putArt69Meta({
    rfc: "_meta",
    lastSyncAt: new Date().toISOString(),
    listas: listasMeta,
    rfcsEscritos,
    rfcsFallidos,
    listasFallidas,
    duration,
  });

  return {
    listasOk: ART69_LISTS.length - listasFallidas.length,
    listasFallidas,
    listasSinCambios,
    rfcsTotal: records.length,
    rfcsEscritos,
    rfcsFallidos,
    duration,
  };
}
