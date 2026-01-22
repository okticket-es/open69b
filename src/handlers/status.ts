/**
 * Handler para GET /sat69b/status/{rfc}
 *
 * Consulta el status de un RFC en la lista 69-B.
 */

import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { ok, badRequest } from "@miermontoto/lambda-responses";
import { isValidRfc, normalizeRfc } from "@/utils/rfcValidator";
import { StatusResponse } from "@/utils/types";
import { getRecordByRfc } from "@/services/sat69bRedis";

/**
 * Handler de status.
 * Valida el RFC y retorna su estado en la lista 69-B.
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const rfcParam = event.pathParameters?.rfc;

  if (!rfcParam) {
    return badRequest("RFC parameter is required");
  }

  // validar formato RFC
  if (!isValidRfc(rfcParam)) {
    return badRequest("Invalid RFC format");
  }

  const rfc = normalizeRfc(rfcParam);
  const record = await getRecordByRfc(rfc);

  if (!record) {
    // no encontrado = no está en la lista 69-B (buenas noticias para el contribuyente)
    const response: StatusResponse = {
      rfc,
      found: false,
      status: null,
    };
    return ok(response);
  }

  // encontrado en la lista
  const response: StatusResponse = {
    rfc,
    found: true,
    status: record.situacion,
    nombre: record.nombre,
    record,
  };

  return ok(response);
}
