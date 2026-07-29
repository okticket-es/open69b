/**
 * Cómputo del timeline del artículo 69: qué supuestos estaban vigentes para
 * un RFC a una fecha dada (asOf), separando entradas/resoluciones/eventos.
 *
 * Semántica (a validar con producto, igual que las ventanas del 69-B):
 * - "Entrada" = una fila de una lista de ESTADO (Firmes/Exigibles/No
 *   localizados/Sentencias) que NO sea una salida por diff.
 * - "Resolución" = cierra la entrada MÁS ANTIGUA aún sin cerrar (emparejado
 *   por orden cronológico, no por lista concreta — el Jira no vincula una
 *   salida a una entrada específica más que por fecha): las listas
 *   Cancelados/Condonados/RetornoInversiones, o una salida por diff
 *   (RFC desaparecido de una lista de estado, `esSalidaPorDiff: true`).
 * - "Informativo" = supuesto independiente que no cierra nada que rastreemos
 *   (ReduccionArt74, CSDsinefectos, EntesPublicos): va directo a `eventos`.
 *
 * LIMITACIÓN CONOCIDA (a validar con producto, confirmada con datos reales
 * del 2026-07-29): el emparejamiento FIFO cronológico puede vincular
 * causalmente eventos administrativos que en realidad son independientes.
 * Ej. real: RFC CEF101103UQ1 tiene 2 entradas (No localizados 2014, Firmes
 * 2016) y 2 filas de Cancelados con créditos distintos (montos y fechas
 * distintas) — el algoritmo empareja por orden, no porque el SAT haya
 * establecido esa relación. No hay forma de distinguir esto de un cierre
 * real sin una vinculación explícita que el SAT no publica.
 */

import { Art69Entry, Art69Record } from "./types";

export interface Art69Timeline {
  supuestosVigentes: Array<{
    supuesto: string;
    listaId: string;
    desde: string;
    hasta: string | null;
  }>;
  eventos: Array<{
    supuesto: string;
    listaId: string;
    fecha: string;
    monto: number | null;
  }>;
  enListaHoy: boolean;
}

const EMPTY: Art69Timeline = {
  supuestosVigentes: [],
  eventos: [],
  enListaHoy: false,
};

function vigenteEn(
  entrada: Art69Entry,
  cierre: Art69Entry | undefined,
  fecha: string,
): boolean {
  if (entrada.fecha === null || fecha < entrada.fecha) return false;
  if (!cierre || cierre.fecha === null) return true;
  return fecha < cierre.fecha;
}

export function computeArt69Timeline(
  record: Art69Record | null,
  asOf: string,
): Art69Timeline {
  if (!record) return EMPTY;

  const entradas = record.entries
    .filter(
      (e) => e.family === "estado" && !e.esSalidaPorDiff && e.fecha !== null,
    )
    .sort((a, b) => a.fecha!.localeCompare(b.fecha!));

  const resoluciones = record.entries
    .filter((e) => e.esResolucion && e.fecha !== null)
    .sort((a, b) => a.fecha!.localeCompare(b.fecha!));

  const informativos = record.entries.filter(
    (e) => !e.esResolucion && e.family === "evento",
  );

  // emparejar cada entrada con la primera resolución sin usar cuya fecha
  // sea ESTRICTAMENTE POSTERIOR a la de la entrada (orden cronológico, no
  // por lista concreta). Estrictamente posterior, no ">=": el SAT publica
  // fechas placeholder masivas (p.ej. "01/01/2014" en filas migradas de
  // golpe) que coinciden por casualidad con la fecha derivada de listas
  // "solo año" (cancelados_07_15/condonados_07_15 → "AAAA-01-01"). Con
  // ">=", una entrada y su "resolución" con la MISMA fecha placeholder
  // producen una ventana de vigencia de ancho cero (nunca vigente, ni
  // hoy) para un RFC que sigue realmente en la lista — confirmado con
  // datos reales del 2026-07-29 (p.ej. RFC DCM921109LL3: Firmes con fecha
  // "01/01/2014" emparejaba con su fila de Cancelados_07_15 año 2014).
  const usadas = new Set<number>();
  const cierrePorEntrada = new Map<number, Art69Entry>();
  entradas.forEach((entrada, idx) => {
    for (let i = 0; i < resoluciones.length; i++) {
      if (usadas.has(i)) continue;
      if (resoluciones[i].fecha! > entrada.fecha!) {
        cierrePorEntrada.set(idx, resoluciones[i]);
        usadas.add(i);
        break;
      }
    }
  });

  const hoy = new Date().toISOString().slice(0, 10);
  const supuestosVigentes: Art69Timeline["supuestosVigentes"] = [];
  let enListaHoy = false;

  entradas.forEach((entrada, idx) => {
    const cierre = cierrePorEntrada.get(idx);
    if (vigenteEn(entrada, cierre, asOf)) {
      supuestosVigentes.push({
        supuesto: entrada.supuesto,
        listaId: entrada.listaId,
        desde: entrada.fecha!,
        hasta: cierre?.fecha ?? null,
      });
    }
    if (vigenteEn(entrada, cierre, hoy)) enListaHoy = true;
  });

  const eventos: Art69Timeline["eventos"] = [
    ...informativos.map((e) => ({
      supuesto: e.supuesto,
      listaId: e.listaId,
      fecha: e.fecha!,
      monto: e.monto,
    })),
    ...resoluciones.map((e) => ({
      supuesto: e.supuesto,
      listaId: e.listaId,
      fecha: e.fecha!,
      monto: e.monto,
    })),
  ];

  return { supuestosVigentes, eventos, enListaHoy };
}
