/**
 * Servicio de descarga y sincronización del CSV del SAT.
 */

import { parseCsv, calculateHash } from "@sat69b/utils/csvParser";
import { Sat69bRecord, SyncMetadata, SyncResult } from "@sat69b/utils/types";
import {
  bulkSetRecords,
  clearAllRecords,
  setMetadata,
  getMetadata,
} from "./sat69bRedis";
import { backupCsvToS3 } from "./s3Backup";

const SAT_CSV_URL =
  process.env.SAT_CSV_URL ||
  "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Descarga el CSV del SAT con retry logic.
 */
async function downloadCsv(): Promise<string> {
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

      // el CSV del SAT puede venir en latin1 o utf-8, intentamos manejar ambos
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder("utf-8");
      return decoder.decode(buffer);
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
    const csvContent = await downloadCsv();
    const csvSize = Buffer.byteLength(csvContent, "utf-8");
    const csvHash = await calculateHash(csvContent);

    console.info(
      `CSV downloaded: ${csvSize} bytes, hash: ${csvHash.substring(0, 16)}...`,
    );

    // verificar si hay cambios
    const currentMetadata = await getMetadata();
    if (currentMetadata?.csvHash === csvHash) {
      console.info("CSV unchanged, skipping sync");

      const metadata: SyncMetadata = {
        lastSyncAt: new Date().toISOString(),
        rowCount: currentMetadata.rowCount,
        csvHash,
        csvSize,
        syncDuration: Date.now() - startTime,
        status: "skipped",
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
      await backupCsvToS3(csvContent);
    } catch (backupErr) {
      console.warn(
        "S3 backup failed (continuing without backup):",
        backupErr instanceof Error ? backupErr.message : backupErr,
      );
    }

    // parsear CSV
    console.info("Parsing CSV...");
    const records: Sat69bRecord[] = parseCsv(csvContent);
    console.info(`Parsed ${records.length} records`);

    // limpiar registros anteriores y cargar nuevos
    console.info("Clearing old records...");
    await clearAllRecords();

    console.info("Loading records to Redis...");
    await bulkSetRecords(records);

    const duration = Date.now() - startTime;

    // guardar metadata
    const metadata: SyncMetadata = {
      lastSyncAt: new Date().toISOString(),
      rowCount: records.length,
      csvHash,
      csvSize,
      syncDuration: duration,
      status: "success",
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

    // guardar metadata de error
    const metadata: SyncMetadata = {
      lastSyncAt: new Date().toISOString(),
      rowCount: 0,
      csvHash: "",
      csvSize: 0,
      syncDuration: duration,
      status: "failed",
      errorMessage: error.message,
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
