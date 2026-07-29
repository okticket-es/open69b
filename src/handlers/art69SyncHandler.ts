/**
 * Handler Lambda para POST /art69/sync y el schedule diario.
 * Sincroniza las 14 listas del artículo 69 (OKT-18900 Fase 2).
 *
 * Esta función NO pasa por el router de api.ts (es una Lambda aparte), así
 * que valida la x-api-key aquí mismo: sin este check, cualquiera podría
 * disparar el sync completo (14 descargas + cientos de miles de escrituras
 * a DynamoDB) desde el dominio público. El schedule de EventBridge queda
 * exento (no lleva headers).
 */

import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  ScheduledEvent,
} from "aws-lambda";
import { ok, serverError, unauthorized } from "@miermontoto/lambda-responses";
import { syncArt69 } from "@/services/art69Sync";

type SyncEvent = APIGatewayProxyEventV2 | ScheduledEvent;

function isScheduledEvent(event: SyncEvent): event is ScheduledEvent {
  return "source" in event && event.source === "aws.events";
}

export async function handler(
  event: SyncEvent,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!isScheduledEvent(event)) {
    // mismo criterio que api.ts: API_KEY vacía = acceso libre (dev local)
    const apiKey = process.env.API_KEY || "";
    const headerKey = (event as APIGatewayProxyEventV2).headers?.["x-api-key"];
    if (apiKey && headerKey !== apiKey) {
      return unauthorized();
    }
  }

  try {
    const result = await syncArt69();
    return ok(result);
  } catch (err) {
    return serverError(err as Error);
  }
}
