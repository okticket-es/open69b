/**
 * Servicio de backup del CSV a S3.
 */

import { S3Wrapper } from "@miermontoto/s3";

const S3_BUCKET = process.env.S3_BUCKET || "open69b-backups";
const S3_REGION = process.env.S3_REGION || "eu-west-1";

// singleton instance
const s3 = new S3Wrapper({ bucket: S3_BUCKET, region: S3_REGION });

/**
 * Genera el key para el backup del CSV.
 * Formato: backups/YYYY/MM/DD/sat69b-TIMESTAMP.csv
 */
function generateBackupKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const timestamp = now.toISOString().replace(/[:.]/g, "-");

  return `backups/${year}/${month}/${day}/sat69b-${timestamp}.csv`;
}

/**
 * Sube el CSV a S3 como backup.
 *
 * @param csvContent - Contenido del CSV
 * @returns Key del objeto creado
 */
export async function backupCsvToS3(csvContent: string): Promise<string> {
  const key = generateBackupKey();

  console.info(`Backing up CSV to S3: s3://${S3_BUCKET}/${key}`);

  const success = await s3.upload(key, csvContent, {
    contentType: "text/csv; charset=utf-8",
    metadata: {
      source: "sat-69b-sync",
      timestamp: new Date().toISOString(),
    },
  });

  if (!success) {
    throw new Error(`Failed to backup CSV to S3: ${key}`);
  }

  console.info(`Backup completed: ${key}`);
  return key;
}
