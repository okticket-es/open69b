/**
 * Handler para GET /sat69b/metadata
 *
 * Retorna información sobre el último sync y estadísticas.
 */

import { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { ok } from "@miermontoto/lambda-responses";
import {
  getMetadata,
  countRecords,
  healthCheck,
} from "@sat69b/services/sat69bRedis";

/**
 * Handler de metadata.
 * Retorna stats del servicio y último sync.
 */
export async function handler(): Promise<APIGatewayProxyStructuredResultV2> {
  const [metadata, recordCount, redisHealthy] = await Promise.all([
    getMetadata(),
    countRecords(),
    healthCheck(),
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
        }
      : null,
  };

  return ok(response);
}
