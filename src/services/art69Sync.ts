/**
 * Orquestador del sync del artículo 69: descarga las 14 listas, detecta
 * salidas por diff en las de "estado", fusiona por RFC entre listas y
 * persiste en DynamoDB. No bloquea nada — solo detecta y traza (Hito 2).
 */

import { ART69_LISTS } from "@/art69/listConfigs";
import { extractRfcs, parseArt69Csv } from "@/art69/parser";
import { aggregateArt69ByRfc, detectExits } from "@/art69/aggregate";
import { readPreviousSnapshot, writeSnapshot } from "@/art69/snapshotStore";
import { putArt69Records } from "@/art69/dynamoStore";
import { decodeCsvBuffer } from "@/utils/encoding";
import { Art69Record } from "@/art69/types";

export interface Art69SyncResult {
  listasOk: number;
  listasFallidas: string[];
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

  for (const config of ART69_LISTS) {
    try {
      const content = await downloadList(config.url);
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
        await writeSnapshot(config.id, content, snapshotDate);
      }

      mergeInto(merged, byRfc);
    } catch (err) {
      console.error(
        `art69Sync: fallo en lista ${config.id}: ${(err as Error).message}`,
      );
      listasFallidas.push(config.id);
    }
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

  return {
    listasOk: ART69_LISTS.length - listasFallidas.length,
    listasFallidas,
    rfcsTotal: records.length,
    rfcsEscritos,
    rfcsFallidos,
    duration: Date.now() - start,
  };
}
