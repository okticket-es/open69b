/**
 * Handler principal de la API sat69b.
 * Enruta las peticiones a los handlers correspondientes.
 */

import { BaseHandler } from "@miermontoto/lambda-handler";
import { notFound, unauthorized } from "@miermontoto/lambda-responses";
import { handler as statusHandler } from "@/handlers/status";
import { handler as metadataHandler } from "@/handlers/metadata";
import { handler as syncHandler } from "@/handlers/sync";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Callback,
  Context,
  ScheduledEvent,
} from "aws-lambda";

type Sat69bEvent = APIGatewayProxyEventV2 | ScheduledEvent;

const API_KEY = process.env.API_KEY || "";

/**
 * Valida el header x-api-key contra la API_KEY configurada.
 */
function isAuthorized(event: APIGatewayProxyEventV2): boolean {
  if (!API_KEY) return true; // sin API_KEY configurada, acceso libre
  const headerKey = event.headers?.["x-api-key"];
  return headerKey === API_KEY;
}

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

    // GET /status/{rfc} - protegido
    if (path.includes("/status/") && method === "GET") {
      if (!isAuthorized(httpEvent)) return unauthorized();
      return this.wrapHandler(statusHandler, httpEvent, context, callback);
    }

    // GET /metadata - público
    if (path.includes("/metadata") && method === "GET") {
      return this.wrapHandler(metadataHandler, httpEvent, context, callback);
    }

    // POST /sync - protegido
    if (path.includes("/sync") && method === "POST") {
      if (!isAuthorized(httpEvent)) return unauthorized();
      return this.wrapHandler(syncHandler, httpEvent, context, callback);
    }

    return notFound();
  }
}

/**
 * Instancia del handler y export.
 * intercepta scheduled events antes de BaseHandler, que los trata como warmups.
 */
const apiHandler = new Sat69bApiHandler();
const baseHandler = apiHandler.handler.bind(apiHandler);

export const handler = async (
  event: Sat69bEvent,
  context: Context,
  callback: Callback,
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (isScheduledEvent(event)) {
    return syncHandler(event);
  }
  return baseHandler(event, context, callback);
};
