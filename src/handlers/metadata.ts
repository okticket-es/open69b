/**
 * Handler para GET /sat69b/metadata
 *
 * Retorna información sobre el último sync y estadísticas.
 */

import { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { ok } from "@miermontoto/lambda-responses";
import { getMetadata, countRecords, healthCheck } from "@/services/sat69bRedis";
import { getArt69Meta } from "@/art69/dynamoStore";

/**
 * Handler de metadata.
 * Retorna stats del servicio y último sync.
 */
export async function handler(): Promise<APIGatewayProxyStructuredResultV2> {
  const [metadata, recordCount, redisHealthy, art69Meta] = await Promise.all([
    getMetadata(),
    countRecords(),
    healthCheck(),
    getArt69Meta(), // ya es fail-safe: null si falla
  ]);

  const response = {
    service: "open69b",
    version: process.env.APP_VERSION || "1.0.0",
    redis: {
      connected: redisHealthy,
      recordCount,
    },
    lastSync: metadata
      ? {
          timestamp: metadata.lastSyncAt,
          status: metadata.status,
          rowCount: metadata.rowCount,
          csvHash: metadata.csvHash.substring(0, 16) + "...",
          csvSize: metadata.csvSize,
          durationMs: metadata.syncDuration,
          errorMessage: metadata.errorMessage,
          dataCutDate: metadata.dataCutDate ?? null,
          skippedInvalidRfc: metadata.skippedInvalidRfc ?? null,
        }
      : null,
    art69: art69Meta
      ? {
          lastSyncAt: art69Meta.lastSyncAt,
          listas: art69Meta.listas,
          rfcsEscritos: art69Meta.rfcsEscritos,
          rfcsFallidos: art69Meta.rfcsFallidos,
          listasFallidas: art69Meta.listasFallidas,
          durationMs: art69Meta.duration,
        }
      : null,
  };

  return ok(response);
}
