/**
 * Handler principal de la API sat69b.
 * Enruta las peticiones a los handlers correspondientes.
 */

import { BaseHandler } from "@miermontoto/lambda-handler";
import { notFound } from "@miermontoto/lambda-responses";
import { handler as statusHandler } from "@sat69b/handlers/status";
import { handler as metadataHandler } from "@sat69b/handlers/metadata";
import { handler as syncHandler } from "@sat69b/handlers/sync";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Callback,
  Context,
  ScheduledEvent,
} from "aws-lambda";

type Sat69bEvent = APIGatewayProxyEventV2 | ScheduledEvent;

/**
 * Detecta si es un scheduled event (para sync automático).
 */
function isScheduledEvent(event: Sat69bEvent): event is ScheduledEvent {
  return "source" in event && event.source === "aws.events";
}

/**
 * Handler de la API de sat69b.
 * Enruta a status, metadata o sync según la ruta.
 */
class Sat69bApiHandler extends BaseHandler {
  /**
   * Método principal de enrutamiento.
   */
  protected async handleRoutes(
    event: Sat69bEvent,
    context: Context,
    callback: Callback,
  ): Promise<APIGatewayProxyStructuredResultV2> {
    // scheduled events van directo a sync
    if (isScheduledEvent(event)) {
      return syncHandler(event);
    }

    const httpEvent = event as APIGatewayProxyEventV2;
    const path = httpEvent.rawPath;
    const method = httpEvent.requestContext?.http?.method;

    // GET /status/{rfc}
    if (path.includes("/status/") && method === "GET") {
      return this.wrapHandler(statusHandler, httpEvent, context, callback);
    }

    // GET /metadata
    if (path.includes("/metadata") && method === "GET") {
      return this.wrapHandler(metadataHandler, httpEvent, context, callback);
    }

    // POST /sync
    if (path.includes("/sync") && method === "POST") {
      return this.wrapHandler(syncHandler, httpEvent, context, callback);
    }

    return notFound();
  }
}

/**
 * Instancia del handler y export.
 */
const apiHandler = new Sat69bApiHandler();
export const handler = apiHandler.handler.bind(apiHandler);
