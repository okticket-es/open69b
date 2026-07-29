import { describe, expect, it } from "vitest";
import { ART69_LISTS } from "@/art69/listConfigs";

describe("ART69_LISTS", () => {
  it("tiene las 14 listas del artículo 69", () => {
    expect(ART69_LISTS).toHaveLength(14);
  });

  it("las 4 listas de estado no tienen esResolucion", () => {
    const estado = ART69_LISTS.filter((l) => l.family === "estado");
    expect(estado.map((l) => l.id).sort()).toEqual([
      "exigibles",
      "firmes",
      "no_localizados",
      "sentencias",
    ]);
    expect(estado.every((l) => !l.esResolucion)).toBe(true);
  });

  it("las resoluciones (cierran un supuesto de estado previo) son exactamente 7", () => {
    const resoluciones = ART69_LISTS.filter((l) => l.esResolucion);
    expect(resoluciones.map((l) => l.id).sort()).toEqual(
      [
        "cancelados",
        "cancelados_07_15",
        "condonados_146b",
        "condonados_21",
        "condonados_07_15",
        "condonados_decreto",
        "retorno_inversiones",
      ].sort(),
    );
  });

  it("cada id es único", () => {
    const ids = ART69_LISTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todas las URLs son del blob del SAT", () => {
    for (const l of ART69_LISTS) {
      expect(l.url).toMatch(
        /^https:\/\/wu1agsprosta001\.blob\.core\.windows\.net\//,
      );
    }
  });
});
