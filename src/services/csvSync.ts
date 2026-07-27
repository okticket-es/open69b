/**
 * Servicio de descarga y sincronización del CSV del SAT.
 */

import { parseCsv, calculateHash } from "@/utils/csvParser";
import { CsvEncoding, decodeCsv } from "@/utils/encoding";
import {
  Sat69bRecord,
  SyncMetadata,
  SyncResult,
  SyncStatus,
} from "@/utils/types";
import {
  bulkSetRecords,
  clearAllRecords,
  setMetadata,
  getMetadata,
} from "./sat69bRedis";
import { backupCsvToS3 } from "./s3Backup";

const SAT_CSV_URL =
  process.env.SAT_CSV_URL ||
  "https://wu1agsprosta001.blob.core.windows.net/agsc-publicaciones/Datos_abiertos/Documents_AGAFF/Listado_completo_69-B.csv";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const STALE_THRESHOLD_DAYS = 90;

/**
 * Loguea un error si la fecha de corte del SAT supera el umbral.
 * El token "SAT_DATA_STALE" es estable: lo consume el metric filter de CloudWatch.
 */
function logIfStale(dataCutDate: string | null | undefined): void {
  if (!dataCutDate) {
    return;
  }
  const ageDays = Math.floor(
    (Date.now() - new Date(dataCutDate).getTime()) / 86_400_000,
  );
  if (ageDays > STALE_THRESHOLD_DAYS) {
    console.error(
      `SAT_DATA_STALE data_cut=${dataCutDate} age_days=${ageDays} threshold=${STALE_THRESHOLD_DAYS}`,
    );
  }
}

/**
 * Descarga el CSV del SAT con retry logic.
 * Devuelve los bytes crudos (para hash/backup) y el texto decodificado (para parsear).
 */
async function downloadCsv(): Promise<{
  raw: Uint8Array;
  content: string;
  encoding: CsvEncoding;
}> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.info(
        `Downloading CSV from SAT (attempt ${attempt}/${MAX_RETRIES})`,
      );

      const response = await fetch(SAT_CSV_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; open69b/1.0)",
          Accept: "text/csv,application/csv,*/*",
        },
        signal: AbortSignal.timeout(60000), // 60s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // bytes crudos: hash y backup se hacen sobre el fichero tal cual;
      // la decodificación (windows-1252/utf-8) es solo para parsear
      const raw = new Uint8Array(await response.arrayBuffer());
      const { content, encoding } = decodeCsv(raw);
      return { raw, content, encoding };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`Download attempt ${attempt} failed: ${lastError.message}`);

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * attempt),
        );
      }
    }
  }

  throw new Error(
    `Failed to download CSV after ${MAX_RETRIES} attempts: ${lastError?.message}`,
  );
}

/**
 * Ejecuta el proceso de sincronización completo.
 *
 * 1. Descarga el CSV
 * 2. Calcula hash para detectar cambios
 * 3. Si hay cambios, hace backup a S3 y sincroniza a Redis
 */
export async function syncFromSat(): Promise<SyncResult> {
  const startTime = Date.now();

  try {
    // descargar CSV
    const { raw, content: csvContent, encoding } = await downloadCsv();
    const csvSize = raw.byteLength;
    const csvHash = await calculateHash(raw);

    console.info(
      `CSV downloaded: ${csvSize} bytes, hash: ${csvHash.substring(0, 16)}...`,
    );

    // verificar si hay cambios
    const currentMetadata = await getMetadata();
    if (currentMetadata?.csvHash === csvHash) {
      console.info("CSV unchanged, skipping sync");
      logIfStale(currentMetadata.dataCutDate);

      const metadata: SyncMetadata = {
        lastSyncAt: new Date().toISOString(),
        rowCount: currentMetadata.rowCount,
        csvHash,
        csvSize,
        syncDuration: Date.now() - startTime,
        status: SyncStatus.SKIPPED,
        dataCutDate: currentMetadata.dataCutDate ?? null,
        skippedInvalidRfc: currentMetadata.skippedInvalidRfc,
      };
      await setMetadata(metadata);

      return {
        success: true,
        message: "CSV unchanged, sync skipped",
        rowCount: currentMetadata.rowCount,
        duration: Date.now() - startTime,
        skipped: true,
      };
    }

    // backup a S3 antes de procesar (opcional, puede fallar en dev local)
    try {
      await backupCsvToS3(raw, encoding);
    } catch (backupErr) {
      console.warn(
        "S3 backup failed (continuing without backup):",
        backupErr instanceof Error ? backupErr.message : backupErr,
      );
    }

    // parsear CSV
    console.info("Parsing CSV...");
    const result = parseCsv(csvContent);
    const records: Sat69bRecord[] = result.records;
    console.info(
      `Parsed ${result.entries.length} rows -> ${records.length} records ` +
        `(skipped ${result.skippedInvalidRfc} invalid RFCs)`,
    );

    // limpiar registros anteriores y cargar nuevos
    console.info("Clearing old records...");
    await clearAllRecords();

    console.info("Loading records to Redis...");
    await bulkSetRecords(records);

    const duration = Date.now() - startTime;

    logIfStale(result.dataCutDate);

    // guardar metadata
    const metadata: SyncMetadata = {
      lastSyncAt: new Date().toISOString(),
      rowCount: records.length,
      csvHash,
      csvSize,
      syncDuration: duration,
      status: SyncStatus.SUCCESS,
      dataCutDate: result.dataCutDate,
      skippedInvalidRfc: result.skippedInvalidRfc,
    };
    await setMetadata(metadata);

    console.info(`Sync completed: ${records.length} records in ${duration}ms`);

    return {
      success: true,
      message: "Sync completed successfully",
      rowCount: records.length,
      duration,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const duration = Date.now() - startTime;

    console.error(`Sync failed: ${error.message}`);

    // preservar la fecha de corte conocida: si la URL del SAT se rompe
    // (el escenario del espejo congelado), la alarma de frescura debe
    // seguir evaluándose con el último corte bueno, no apagarse
    let previous: SyncMetadata | null = null;
    try {
      previous = await getMetadata();
    } catch {
      // si Redis tampoco responde no hay metadata que preservar
    }
    logIfStale(previous?.dataCutDate);

    // guardar metadata de error
    const metadata: SyncMetadata = {
      lastSyncAt: new Date().toISOString(),
      rowCount: 0,
      csvHash: "",
      csvSize: 0,
      syncDuration: duration,
      status: SyncStatus.FAILED,
      errorMessage: error.message,
      dataCutDate: previous?.dataCutDate ?? null,
      skippedInvalidRfc: previous?.skippedInvalidRfc,
    };
    await setMetadata(metadata);

    return {
      success: false,
      message: "Sync failed",
      duration,
      error: error.message,
    };
  }
}
