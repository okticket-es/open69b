/**
 * Golden tests contra el CSV REAL del SAT (no fixtures sintéticas).
 *
 * Se saltan si el fichero no existe. Para ejecutarlos:
 *   curl -s -o /tmp/l69b-real.csv <SAT_CSV_URL del serverless.yml>
 *   pnpm test golden
 *
 * Números de referencia verificados sobre el corte 31-dic-2025:
 * 14.234 filas de datos, 92 filas con RFC censurado (XXXXXXXXXXXX),
 * 81 RFCs con más de un expediente. Las filas de datos solo crecen entre
 * cortes; las censuradas fluctúan (91 en el corte 31-may-2026), así que
 * se asserta el orden de magnitud, no el valor exacto.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { decodeCsvBuffer } from "@/utils/encoding";
import { parseCsv } from "@/utils/csvParser";

const CSV_PATH = process.env.REAL_69B_CSV ?? "/tmp/l69b-real.csv";

describe.skipIf(!existsSync(CSV_PATH))("golden: CSV real del SAT", () => {
  const raw = existsSync(CSV_PATH) ? readFileSync(CSV_PATH) : Buffer.alloc(0);

  it("parsea el fichero completo con los números verificados", () => {
    const result = parseCsv(decodeCsvBuffer(raw));
    expect(result.entries.length).toBeGreaterThanOrEqual(14234 - 92);
    expect(result.skippedInvalidRfc).toBeGreaterThanOrEqual(50);
    expect(result.skippedInvalidRfc).toBeLessThan(500);
    expect(result.records.length).toBeLessThan(result.entries.length); // hay multi-expediente
    expect(result.dataCutDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sin nombres corruptos por encoding", () => {
    const result = parseCsv(decodeCsvBuffer(raw));
    const corrupt = result.records.filter((r) => r.nombre.includes("�"));
    expect(corrupt).toHaveLength(0);
  });

  it("ningún record con rfc 'RFC' ni 'XXXXXXXXXXXX'", () => {
    const result = parseCsv(decodeCsvBuffer(raw));
    const rfcs = new Set(result.records.map((r) => r.rfc));
    expect(rfcs.has("RFC")).toBe(false);
    expect(rfcs.has("XXXXXXXXXXXX")).toBe(false);
  });

  it("los multi-expediente conocidos agregan (AAS110331G59)", () => {
    const result = parseCsv(decodeCsvBuffer(raw));
    const r = result.records.find((x) => x.rfc === "AAS110331G59");
    expect(r).toBeDefined();
    expect(r!.expedientes.length).toBeGreaterThanOrEqual(2);
  });

  it("asOf con datos reales: exculpación, ventana y des-bloqueo por fecha", async () => {
    const { computeVerdict } = await import("@/utils/verdict");
    const result = parseCsv(decodeCsvBuffer(raw));
    const byRfc = new Map(result.records.map((r) => [r.rfc, r]));

    // AAA080808HL8: Sentencia Favorable (presunción 01/06/2018 → sentencia 05/03/2019)
    // gasto fechado DENTRO del periodo Definitivo → exculpado, no vigente
    const sentFav = byRfc.get("AAA080808HL8");
    expect(sentFav).toBeDefined();
    const vSf = computeVerdict(sentFav!, "2018-10-15");
    expect(vSf.vigente).toBeNull();
    expect(vSf.exculpado).toBe(true);

    // un Definitivo real: hoy vigente; antes de su presunción, limpio
    const definitivo = result.records.find(
      (r) => r.situacion === "Definitivo" && r.expedientes.length === 1,
    );
    expect(definitivo).toBeDefined();
    const vHoy = computeVerdict(definitivo!, "2026-07-27");
    expect(vHoy.vigente).toBe("Definitivo");
    const vAntes = computeVerdict(definitivo!, "2000-01-01");
    expect(vAntes.vigente).toBeNull();
  });

  it("las situaciones del CSV se mapean al enum (tasa de null despreciable)", () => {
    // parseStatus coacciona literales desconocidos a null: si el SAT renombra
    // las situaciones, este test lo detecta (todo el fichero caería a null)
    const result = parseCsv(decodeCsvBuffer(raw));
    const nulls = result.entries.filter((e) => e.situacion === null).length;
    expect(nulls / result.entries.length).toBeLessThan(0.01);
  });
});
