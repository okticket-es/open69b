/**
 * Cómputo del veredicto temporal 69-B: qué supuesto estaba vigente para un RFC
 * a una fecha dada (asOf), a partir de las fechas de publicación del CSV.
 *
 * Semántica (spec §3.3, a validar con producto — TODO el criterio vive aquí):
 * - Presunto:   [pub presunción, min(pub desvirtuado, pub definitivo))
 * - Definitivo: [pub definitivo, pub sentencia favorable)  (sin fin si no hay)
 * - Desvirtuado / Sentencia Favorable ⇒ expediente EXCULPADO: nunca bloquea,
 *   pero se reporta exculpado=true si su ventana cubría asOf.
 * - Preferencia de fecha: publicación SAT; fallback publicación DOF.
 * - Conservador: expediente NO exculpado sin fecha de inicio parseable se trata
 *   como vigente con su situación actual (nunca des-bloquear por fallo de parseo).
 */

import { parseSatDate } from "./dates";
import {
  Expediente,
  ProcessStep,
  Sat69bRecord,
  Sat69bStatus,
  Verdict69b,
} from "./types";

const EXCULPATORIAS = new Set<Sat69bStatus>([
  Sat69bStatus.DESVIRTUADO,
  Sat69bStatus.SENTENCIA_FAVORABLE,
]);

function fecha(step: ProcessStep): string | null {
  return parseSatDate(step.fechaSat) ?? parseSatDate(step.fechaDof);
}

interface Candidato {
  vigente: Sat69bStatus;
  ventana: { from: string; to: string | null } | null;
  expediente: number;
}

function evaluarExpediente(
  e: Expediente,
  idx: number,
  asOf: string,
): { candidato: Candidato | null; exculpadoEnVentana: boolean } {
  const presStart = fecha(e.presuncion);
  const desvDate = fecha(e.desvirtuado);
  const defStart = fecha(e.definitivo);
  const sfDate = fecha(e.sentenciaFavorable);

  const exculpado = e.situacion !== null && EXCULPATORIAS.has(e.situacion);

  if (exculpado) {
    // fin del proceso del expediente exculpado: desvirtuado o sentencia
    const fin = desvDate ?? sfDate;
    const enVentana =
      presStart !== null && asOf >= presStart && (fin === null || asOf < fin);
    return { candidato: null, exculpadoEnVentana: enVentana };
  }

  // expediente activo (Presunto/Definitivo) sin fechas parseables → conservador
  if (presStart === null && defStart === null) {
    if (e.situacion === null) {
      return { candidato: null, exculpadoEnVentana: false };
    }
    return {
      candidato: { vigente: e.situacion, ventana: null, expediente: idx },
      exculpadoEnVentana: false,
    };
  }

  // ventana Definitivo: [defStart, sfDate)
  if (
    defStart !== null &&
    asOf >= defStart &&
    (sfDate === null || asOf < sfDate)
  ) {
    return {
      candidato: {
        vigente: Sat69bStatus.DEFINITIVO,
        ventana: { from: defStart, to: sfDate },
        expediente: idx,
      },
      exculpadoEnVentana: false,
    };
  }

  // ventana Presunto: [presStart, min(desvDate, defStart))
  if (presStart !== null && asOf >= presStart) {
    const fin =
      [desvDate, defStart].filter((d): d is string => d !== null).sort()[0] ??
      null;
    if (fin === null || asOf < fin) {
      return {
        candidato: {
          vigente: Sat69bStatus.PRESUNTO,
          ventana: { from: presStart, to: fin },
          expediente: idx,
        },
        exculpadoEnVentana: false,
      };
    }
  }

  return { candidato: null, exculpadoEnVentana: false };
}

/**
 * Computa el veredicto del record completo a la fecha asOf (ISO YYYY-MM-DD).
 * Con varios expedientes gana el supuesto vigente más severo NO exculpado.
 */
export function computeVerdict(record: Sat69bRecord, asOf: string): Verdict69b {
  const candidatos: Candidato[] = [];
  let exculpadoEnVentana = false;

  record.expedientes.forEach((e, idx) => {
    const r = evaluarExpediente(e, idx, asOf);
    if (r.candidato) candidatos.push(r.candidato);
    if (r.exculpadoEnVentana) exculpadoEnVentana = true;
  });

  const definitivo = candidatos.find(
    (c) => c.vigente === Sat69bStatus.DEFINITIVO,
  );
  const elegido = definitivo ?? candidatos[0] ?? null;

  if (elegido) {
    return {
      vigente: elegido.vigente,
      exculpado: false,
      ventana: elegido.ventana,
      expediente: elegido.expediente,
    };
  }

  return {
    vigente: null,
    exculpado: exculpadoEnVentana,
    ventana: null,
    expediente: null,
  };
}
