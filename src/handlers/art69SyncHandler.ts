/**
 * Handler Lambda para POST /art69/sync y el schedule diario.
 * Sincroniza las 14 listas del artículo 69 (OKT-18900 Fase 2).
 */

import { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { ok, serverError } from "@miermontoto/lambda-responses";
import { syncArt69 } from "@/services/art69Sync";

export async function handler(): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const result = await syncArt69();
    return ok(result);
  } catch (err) {
    return serverError(err as Error);
  }
}
