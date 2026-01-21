/**
 * Servicio de backup del CSV a S3.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const S3_BUCKET = process.env.S3_BUCKET || "open69b-backups";
const S3_REGION = process.env.S3_REGION || "eu-west-1";

let s3Client: S3Client | null = null;

/**
 * Obtiene o crea el cliente S3.
 */
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: S3_REGION });
  }
  return s3Client;
}

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
  const client = getS3Client();
  const key = generateBackupKey();

  console.info(`Backing up CSV to S3: s3://${S3_BUCKET}/${key}`);

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: csvContent,
    ContentType: "text/csv; charset=utf-8",
    Metadata: {
      source: "sat-69b-sync",
      timestamp: new Date().toISOString(),
    },
  });

  await client.send(command);

  console.info(`Backup completed: ${key}`);
  return key;
}
