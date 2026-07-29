/**
 * Snapshots permanentes de las listas "estado" del artículo 69 en S3.
 * Se usan para inferir salidas por diff (el SAT no publica una lista de
 * "eliminados" del art.69). Prefijo `snapshots/` SIN expiración, distinto
 * del `backups/` de 30 días que usa el sync del 69-B.
 */

import { S3Wrapper } from "@miermontoto/s3";

const S3_BUCKET = process.env.S3_BUCKET || "open69b-backups";
const S3_REGION = process.env.S3_REGION || "eu-west-1";
const s3 = new S3Wrapper({ bucket: S3_BUCKET, region: S3_REGION });

function latestKey(listaId: string): string {
  return `snapshots/art69/${listaId}/latest.csv`;
}

function datedKey(listaId: string, date: string): string {
  return `snapshots/art69/${listaId}/${date}.csv`;
}

/** Lee el snapshot anterior (para diff); null si es la primera vez o falla. */
export async function readPreviousSnapshot(
  listaId: string,
): Promise<string | null> {
  try {
    const content = await s3.download(latestKey(listaId), "text");
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

/** Sube el snapshot actual: sobrescribe `latest` + guarda copia fechada permanente. */
export async function writeSnapshot(
  listaId: string,
  content: string,
  date: string,
): Promise<void> {
  await s3.upload(latestKey(listaId), Buffer.from(content, "utf-8"), {
    contentType: "text/csv; charset=utf-8",
  });
  await s3.upload(datedKey(listaId, date), Buffer.from(content, "utf-8"), {
    contentType: "text/csv; charset=utf-8",
  });
}
