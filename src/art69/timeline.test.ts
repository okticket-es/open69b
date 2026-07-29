import { describe, expect, it } from "vitest";
import { computeArt69Timeline } from "@/art69/timeline";
import { Art69Entry, Art69Record } from "@/art69/types";

const entrada = (
  listaId: string,
  supuesto: string,
  fecha: string,
): Art69Entry => ({
  listaId,
  family: "estado",
  supuesto,
  fecha,
  monto: null,
  entidadFederativa: null,
  esResolucion: false,
});

const resolucion = (
  listaId: string,
  supuesto: string,
  fecha: string,
  monto: number | null = 1000,
): Art69Entry => ({
  listaId,
  family: "evento",
  supuesto,
  fecha,
  monto,
  entidadFederativa: null,
  esResolucion: true,
});

const salidaPorDiff = (listaId: string, fecha: string): Art69Entry => ({
  listaId,
  family: "estado",
  supuesto: "ELIMINADO",
  fecha,
  monto: null,
  entidadFederativa: null,
  esResolucion: true,
  esSalidaPorDiff: true,
});

const informativo = (
  listaId: string,
  supuesto: string,
  fecha: string,
): Art69Entry => ({
  listaId,
  family: "evento",
  supuesto,
  fecha,
  monto: null,
  entidadFederativa: null,
  esResolucion: false,
});

const record = (...entries: Art69Entry[]): Art69Record => ({
  rfc: "AAA080808HL8",
  nombre: "TEST",
  entries,
});

describe("computeArt69Timeline", () => {
  it("record null → timeline vacío", () => {
    expect(computeArt69Timeline(null, "2024-01-01")).toEqual({
      supuestosVigentes: [],
      eventos: [],
      enListaHoy: false,
    });
  });

  it("entrada sin resolución: vigente en cualquier fecha posterior a su entrada", () => {
    const r = record(entrada("firmes", "FIRMES", "2020-01-01"));
    const t = computeArt69Timeline(r, "2023-06-01");
    expect(t.supuestosVigentes).toEqual([
      {
        supuesto: "FIRMES",
        listaId: "firmes",
        desde: "2020-01-01",
        hasta: null,
      },
    ]);
  });

  it("no vigente ANTES de la fecha de entrada", () => {
    const r = record(entrada("firmes", "FIRMES", "2020-01-01"));
    const t = computeArt69Timeline(r, "2019-12-31");
    expect(t.supuestosVigentes).toHaveLength(0);
  });

  it("entrada + resolución (cancelados): vigente ENTRE ambas fechas, no después", () => {
    const r = record(
      entrada("firmes", "FIRMES", "2020-01-01"),
      resolucion("cancelados", "CANCELADOS", "2023-05-01", 5000),
    );
    expect(computeArt69Timeline(r, "2021-01-01").supuestosVigentes).toEqual([
      {
        supuesto: "FIRMES",
        listaId: "firmes",
        desde: "2020-01-01",
        hasta: "2023-05-01",
      },
    ]);
    expect(
      computeArt69Timeline(r, "2024-01-01").supuestosVigentes,
    ).toHaveLength(0);
  });

  it("salida por diff (no_localizados → eliminado) cierra la entrada igual que una resolución", () => {
    const r = record(
      entrada("no_localizados", "NO LOCALIZADOS", "2019-01-01"),
      salidaPorDiff("no_localizados", "2024-03-01"),
    );
    expect(computeArt69Timeline(r, "2020-01-01").supuestosVigentes).toEqual([
      {
        supuesto: "NO LOCALIZADOS",
        listaId: "no_localizados",
        desde: "2019-01-01",
        hasta: "2024-03-01",
      },
    ]);
    expect(
      computeArt69Timeline(r, "2025-01-01").supuestosVigentes,
    ).toHaveLength(0);
  });

  it("supuestos informativos (reduccion_art74, csd_sin_efectos...) van a eventos, nunca a vigentes", () => {
    const r = record(
      informativo("csd_sin_efectos", "FRACCION X", "2024-01-01"),
    );
    const t = computeArt69Timeline(r, "2025-01-01");
    expect(t.supuestosVigentes).toHaveLength(0);
    expect(t.eventos).toEqual([
      {
        supuesto: "FRACCION X",
        listaId: "csd_sin_efectos",
        fecha: "2024-01-01",
        monto: null,
      },
    ]);
  });

  it("las resoluciones también aparecen en eventos (con motivo y fecha)", () => {
    const r = record(
      entrada("firmes", "FIRMES", "2020-01-01"),
      resolucion("cancelados", "CANCELADOS", "2023-05-01", 5000),
    );
    const t = computeArt69Timeline(r, "2024-01-01");
    expect(t.eventos).toEqual([
      {
        supuesto: "CANCELADOS",
        listaId: "cancelados",
        fecha: "2023-05-01",
        monto: 5000,
      },
    ]);
  });

  it("multi-entrada: cada resolución cierra la entrada más antigua sin cerrar", () => {
    const r = record(
      entrada("firmes", "FIRMES", "2020-01-01"),
      resolucion("cancelados", "CANCELADOS", "2021-01-01"),
      entrada("exigibles", "EXIGIBLES", "2022-01-01"),
    );
    // a 2021-06: Firmes ya se cerró (2021-01), Exigibles aún no ha entrado (2022)
    const t1 = computeArt69Timeline(r, "2021-06-01");
    expect(t1.supuestosVigentes).toHaveLength(0);
    // a 2023: Exigibles vigente (entró 2022, sin resolución propia)
    const t2 = computeArt69Timeline(r, "2023-01-01");
    expect(t2.supuestosVigentes).toEqual([
      {
        supuesto: "EXIGIBLES",
        listaId: "exigibles",
        desde: "2022-01-01",
        hasta: null,
      },
    ]);
  });

  it("enListaHoy: true si hay un supuesto vigente HOY (independiente del asOf pedido)", () => {
    const r = record(entrada("firmes", "FIRMES", "2020-01-01"));
    // asOf en el pasado (limpio en ese momento por fecha), pero HOY sigue vigente
    const t = computeArt69Timeline(r, "2010-01-01");
    expect(t.supuestosVigentes).toHaveLength(0); // no vigente en 2010 (antes de entrar)
    expect(t.enListaHoy).toBe(true); // pero SÍ vigente hoy
  });

  it("enListaHoy: false si la única entrada ya se resolvió", () => {
    const r = record(
      entrada("firmes", "FIRMES", "2020-01-01"),
      resolucion("cancelados", "CANCELADOS", "2021-01-01"),
    );
    expect(computeArt69Timeline(r, "2020-06-01").enListaHoy).toBe(false);
  });

  it("misma fecha placeholder entre entrada y resolución NO la cierra (regresión: caso real DCM921109LL3)", () => {
    // el SAT publica "01/01/2014" como fecha de migración masiva en Firmes,
    // que coincide con la fecha derivada (soloAnio) de una fila de
    // Cancelados_07_15 del año 2014 — antes de la corrección, esto producía
    // una ventana de ancho cero (enListaHoy: false para un RFC que SÍ sigue
    // en Firmes.csv hoy)
    const r = record(
      entrada("firmes", "FIRMES", "2014-01-01"),
      resolucion("cancelados_07_15", "CANCELADOS", "2014-01-01", 5000),
    );
    const t = computeArt69Timeline(r, "2026-07-29");
    expect(t.supuestosVigentes).toEqual([
      {
        supuesto: "FIRMES",
        listaId: "firmes",
        desde: "2014-01-01",
        hasta: null,
      },
    ]);
    expect(t.enListaHoy).toBe(true);
  });

  it("REGLA DEL JIRA: 'no localizados' SOLO sale por eliminado — una cancelación NO lo cierra", () => {
    const r = record(
      entrada("no_localizados", "NO LOCALIZADOS", "2015-01-01"),
      resolucion("cancelados", "CANCELADOS", "2017-06-01", 9000),
    );
    // la cancelación de un crédito no saca al RFC de "no localizados":
    // sigue vigente hoy, la cancelación queda solo como evento
    const t = computeArt69Timeline(r, "2026-07-29");
    expect(t.supuestosVigentes).toEqual([
      {
        supuesto: "NO LOCALIZADOS",
        listaId: "no_localizados",
        desde: "2015-01-01",
        hasta: null,
      },
    ]);
    expect(t.enListaHoy).toBe(true);
    expect(t.eventos).toHaveLength(1); // la cancelación no se pierde
  });

  it("una salida por diff solo cierra la entrada de SU MISMA lista", () => {
    const r = record(
      entrada("exigibles", "EXIGIBLES", "2015-01-01"),
      entrada("firmes", "FIRMES", "2016-01-01"),
      salidaPorDiff("firmes", "2020-01-01"),
    );
    const t = computeArt69Timeline(r, "2026-07-29");
    // firmes se cerró por su propia desaparición; exigibles sigue vigente
    expect(t.supuestosVigentes).toEqual([
      {
        supuesto: "EXIGIBLES",
        listaId: "exigibles",
        desde: "2015-01-01",
        hasta: null,
      },
    ]);
  });

  it("cancelados/condonados cierran créditos (firmes/exigibles), respetando la más antigua", () => {
    const r = record(
      entrada("no_localizados", "NO LOCALIZADOS", "2014-01-01"),
      entrada("firmes", "FIRMES", "2016-01-01"),
      resolucion("cancelados", "CANCELADOS", "2017-01-01", 8800),
    );
    const t = computeArt69Timeline(r, "2026-07-29");
    // la cancelación cierra FIRMES (crédito), no "no localizados"
    expect(t.supuestosVigentes).toEqual([
      {
        supuesto: "NO LOCALIZADOS",
        listaId: "no_localizados",
        desde: "2014-01-01",
        hasta: null,
      },
    ]);
  });

  it("'sentencias' tampoco se cierra por cancelación/condonación (solo por eliminación de su lista)", () => {
    const r = record(
      entrada("sentencias", "SENTENCIAS", "2015-01-01"),
      resolucion("condonados_146b", "CONDONADOS", "2018-01-01", 100),
    );
    const t = computeArt69Timeline(r, "2026-07-29");
    expect(t.supuestosVigentes).toHaveLength(1);
    expect(t.supuestosVigentes[0].listaId).toBe("sentencias");
  });

  it("entrada sin fecha (null) se ignora de forma conservadora", () => {
    const r = record({
      ...entrada("firmes", "FIRMES", "2020-01-01"),
      fecha: null,
    });
    const t = computeArt69Timeline(r, "2024-01-01");
    expect(t.supuestosVigentes).toHaveLength(0);
  });
});
