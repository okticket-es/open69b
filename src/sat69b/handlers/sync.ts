/**
 * Handler para POST /sat69b/sync y scheduled sync.
 *
 * Sincroniza la lista 69-B desde el CSV del SAT.
 */

import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  ScheduledEvent,
} from "aws-lambda";
import { ok, serverError } from "@miermontoto/lambda-responses";
import { syncFromSat } from "@sat69b/services/csvSync";

type SyncEvent = APIGatewayProxyEventV2 | ScheduledEvent;

/**
 * Detecta si el evento es un scheduled event de CloudWatch.
 */
function isScheduledEvent(event: SyncEvent): event is ScheduledEvent {
  return "source" in event && event.source === "aws.events";
}

/**
 * Handler de sync.
 * Puede ser invocado manualmente via POST o por CloudWatch Events.
 */
export async function handler(
  event: SyncEvent,
): Promise<APIGatewayProxyStructuredResultV2> {
  const isScheduled = isScheduledEvent(event);

  console.info(`Sync triggered: ${isScheduled ? "scheduled" : "manual"}`);

  try {
    const result = await syncFromSat();

    if (!result.success) {
      return serverError(`Sync failed: ${result.error || "Unknown error"}`);
    }

    return ok({
      success: true,
      triggered: isScheduled ? "scheduled" : "manual",
      message: result.message,
      rowCount: result.rowCount,
      duration: result.duration,
      skipped: result.skipped || false,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`Sync handler error: ${error.message}`);

    return serverError(error);
  }
}
