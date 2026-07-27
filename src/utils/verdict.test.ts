import { describe, expect, it } from "vitest";
import { computeVerdict } from "@/utils/verdict";
import {
  Expediente,
  ProcessStep,
  Sat69bRecord,
  Sat69bStatus,
} from "@/utils/types";

const step = (
  fechaSat: string | null,
  fechaDof: string | null = null,
): ProcessStep => ({
  oficioSat: fechaSat ? "OF" : null,
  fechaSat,
  oficioDof: fechaDof ? "OF-DOF" : null,
  fechaDof,
});

const EMPTY = step(null);

const exp = (
  situacion: Sat69bStatus | null,
  fases: Partial<
    Record<
      "presuncion" | "desvirtuado" | "definitivo" | "sentenciaFavorable",
      ProcessStep
    >
  >,
): Expediente => ({
  situacion,
  presuncion: fases.presuncion ?? EMPTY,
  desvirtuado: fases.desvirtuado ?? EMPTY,
  definitivo: fases.definitivo ?? EMPTY,
  sentenciaFavorable: fases.sentenciaFavorable ?? EMPTY,
});

const record = (...expedientes: Expediente[]): Sat69bRecord => ({
  rfc: "AAA080808HL8",
  nombre: "TEST",
  situacion: null,
  expedientes,
});

// caso real AAA080808HL8: presunción 01/06/2018, definitivo 28/09/2018, sentencia 05/03/2019
const SENT_FAV = exp(Sat69bStatus.SENTENCIA_FAVORABLE, {
  presuncion: step("01/06/2018"),
  definitivo: step("28/09/2018"),
  sentenciaFavorable: step("05/03/2019"),
});

const DEFINITIVO = exp(Sat69bStatus.DEFINITIVO, {
  presuncion: step("01/01/2020"),
  definitivo: step("01/06/2020"),
});

describe("computeVerdict — ventanas por expediente", () => {
  it("Definitivo vigente desde su publicación (sin fin sin sentencia)", () => {
    const v = computeVerdict(record(DEFINITIVO), "2024-01-01");
    expect(v.vigente).toBe(Sat69bStatus.DEFINITIVO);
    expect(v.ventana).toEqual({ from: "2020-06-01", to: null });
    expect(v.exculpado).toBe(false);
    expect(v.expediente).toBe(0);
  });

  it("Presunto vigente entre presunción y definitivo", () => {
    const v = computeVerdict(record(DEFINITIVO), "2020-03-01");
    expect(v.vigente).toBe(Sat69bStatus.PRESUNTO);
    expect(v.ventana).toEqual({ from: "2020-01-01", to: "2020-06-01" });
  });

  it("fecha anterior a la presunción → limpio (des-bloqueo correcto por fecha)", () => {
    const v = computeVerdict(record(DEFINITIVO), "2019-12-31");
    expect(v.vigente).toBeNull();
    expect(v.exculpado).toBe(false);
  });

  it("expediente con Sentencia Favorable → exculpado, nunca vigente (decisión de producto)", () => {
    // asOf cae DENTRO del periodo Definitivo del expediente, pero acabó exculpado
    const v = computeVerdict(record(SENT_FAV), "2018-10-15");
    expect(v.vigente).toBeNull();
    expect(v.exculpado).toBe(true);
  });

  it("Desvirtuado → exculpado dentro de su ventana de presunción", () => {
    const desv = exp(Sat69bStatus.DESVIRTUADO, {
      presuncion: step("01/01/2017"),
      desvirtuado: step("13/10/2017"),
    });
    expect(computeVerdict(record(desv), "2017-05-01").exculpado).toBe(true);
    expect(computeVerdict(record(desv), "2016-05-01").exculpado).toBe(false);
  });

  it("multi-expediente: bloquea si CUALQUIER expediente no exculpado está vigente", () => {
    const v = computeVerdict(record(SENT_FAV, DEFINITIVO), "2021-01-01");
    expect(v.vigente).toBe(Sat69bStatus.DEFINITIVO);
    expect(v.expediente).toBe(1);
  });

  it("conservador: expediente no exculpado sin fechas parseables → vigente = su situación", () => {
    const sinFechas = exp(Sat69bStatus.DEFINITIVO, {});
    const v = computeVerdict(record(sinFechas), "2010-01-01");
    expect(v.vigente).toBe(Sat69bStatus.DEFINITIVO);
    expect(v.ventana).toBeNull();
  });

  it("fallback a fecha DOF si falta la de SAT", () => {
    const soloDof = exp(Sat69bStatus.DEFINITIVO, {
      presuncion: step(null, "15/01/2020"),
      definitivo: step(null, "15/06/2020"),
    });
    const v = computeVerdict(record(soloDof), "2020-03-01");
    expect(v.vigente).toBe(Sat69bStatus.PRESUNTO);
    expect(v.ventana).toEqual({ from: "2020-01-15", to: "2020-06-15" });
  });

  it("record sin expedientes → limpio", () => {
    const v = computeVerdict(record(), "2024-01-01");
    expect(v).toEqual({
      vigente: null,
      exculpado: false,
      ventana: null,
      expediente: null,
    });
  });
});
