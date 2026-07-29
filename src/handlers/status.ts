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
import {
  Expediente,
  LegacyRecordView,
  ProcessStep,
  Sat69bEntry,
  Sat69bRecord,
  SEVERITY_ORDER,
  Sat69bStatus,
  StatusResponse,
  worstSituacion,
} from "@/utils/types";
import { getRecordByRfc } from "@/services/sat69bRedis";
import { computeVerdict } from "@/utils/verdict";
import { getArt69Record } from "@/art69/dynamoStore";
import { computeArt69Timeline } from "@/art69/timeline";

const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_STEP: ProcessStep = {
  oficioSat: null,
  fechaSat: null,
  oficioDof: null,
  fechaDof: null,
};

const EMPTY_EXPEDIENTE: Expediente = {
  situacion: null,
  presuncion: EMPTY_STEP,
  desvirtuado: EMPTY_STEP,
  definitivo: EMPTY_STEP,
  sentenciaFavorable: EMPTY_STEP,
};

/**
 * Envuelve records con el formato plano viejo (pre multi-expediente)
 * que puedan quedar en Redis hasta el primer sync tras el despliegue.
 */
export function normalizeStoredRecord(
  raw: Sat69bRecord | Sat69bEntry,
): Sat69bRecord {
  if ("expedientes" in raw && Array.isArray(raw.expedientes)) {
    return raw;
  }
  const legacy = raw as Sat69bEntry;
  const expediente: Expediente = {
    situacion: legacy.situacion ?? null,
    presuncion: legacy.presuncion ?? EMPTY_STEP,
    desvirtuado: legacy.desvirtuado ?? EMPTY_STEP,
    definitivo: legacy.definitivo ?? EMPTY_STEP,
    sentenciaFavorable: legacy.sentenciaFavorable ?? EMPTY_STEP,
  };
  return {
    rfc: legacy.rfc,
    nombre: legacy.nombre,
    situacion: worstSituacion([expediente]),
    expedientes: [expediente],
  };
}

/**
 * Proyección v1: el expediente más severo, aplanado como el record histórico.
 */
export function buildV1Record(record: Sat69bRecord): LegacyRecordView {
  const rank = (s: Sat69bStatus | null): number =>
    s === null ? Number.POSITIVE_INFINITY : SEVERITY_ORDER.indexOf(s);
  const worst =
    [...record.expedientes].sort(
      (a, b) => rank(a.situacion) - rank(b.situacion),
    )[0] ?? EMPTY_EXPEDIENTE;
  return {
    ...worst,
    rfc: record.rfc,
    nombre: record.nombre,
    situacion: record.situacion,
  };
}

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

  // asOf opcional: fecha de referencia (fecha del gasto) para el veredicto temporal
  const asOf = event.queryStringParameters?.asOf;
  if (asOf !== undefined && !ASOF_PATTERN.test(asOf)) {
    return badRequest("Invalid asOf format (YYYY-MM-DD)");
  }

  const rfc = normalizeRfc(rfcParam);

  // el 69-B y el artículo 69 son listas independientes: se consultan las
  // dos (en paralelo), un RFC puede estar en una y no en la otra. El bloque
  // art69 es INFORMATIVO: si DynamoDB falla se degrada a timeline vacío con
  // log — jamás puede tumbar la respuesta, porque el verdict69b del 69-B es
  // el que decide bloqueos reales en george-core (que es fail-open ante un
  // 500: un fallo aquí desactivaría el bloqueo en silencio).
  const art69Promise = asOf
    ? getArt69Record(rfc).catch((err: Error) => {
        console.error(
          `art69 lookup falló para ${rfc} (non-critical): ${err.message}`,
        );
        return null;
      })
    : null;

  const stored = await getRecordByRfc(rfc);
  const record = stored ? normalizeStoredRecord(stored) : null;

  const response: StatusResponse = record
    ? {
        rfc,
        found: true,
        status: record.situacion,
        nombre: record.nombre,
        record: buildV1Record(record),
        expedientes: record.expedientes,
      }
    : { rfc, found: false, status: null };

  if (asOf && art69Promise) {
    response.asOf = asOf;
    response.verdict69b = record
      ? computeVerdict(record, asOf)
      : { vigente: null, exculpado: false, ventana: null, expediente: null };
    response.art69 = computeArt69Timeline(await art69Promise, asOf);
  }

  return ok(response);
}
