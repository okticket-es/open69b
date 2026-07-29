import { describe, expect, it } from "vitest";
import { aggregateArt69ByRfc, detectExits } from "@/art69/aggregate";
import { ParsedArt69Row } from "@/art69/parser";

const row = (
  rfc: string,
  listaId: string,
  supuesto: string,
): ParsedArt69Row => ({
  rfc,
  nombre: "TEST",
  entry: {
    listaId,
    family: "estado",
    supuesto,
    fecha: "2020-01-01",
    monto: null,
    entidadFederativa: null,
    esResolucion: false,
  },
});

describe("aggregateArt69ByRfc", () => {
  it("agrupa varias entradas del mismo RFC en distintas listas", () => {
    const rows = [
      row("AAA080808HL8", "firmes", "FIRMES"),
      row("AAA080808HL8", "no_localizados", "NO LOCALIZADOS"),
    ];
    const byRfc = aggregateArt69ByRfc(rows);
    expect(byRfc.get("AAA080808HL8")!.entries).toHaveLength(2);
  });

  it("conserva el nombre del primer registro que lo traiga", () => {
    const rows: ParsedArt69Row[] = [
      { ...row("AAA080808HL8", "firmes", "FIRMES"), nombre: "" },
      {
        ...row("AAA080808HL8", "no_localizados", "NO LOCALIZADOS"),
        nombre: "EMPRESA X",
      },
    ];
    const byRfc = aggregateArt69ByRfc(rows);
    expect(byRfc.get("AAA080808HL8")!.nombre).toBe("EMPRESA X");
  });

  it("RFCs distintos no se mezclan", () => {
    const rows = [
      row("AAA080808HL8", "firmes", "FIRMES"),
      row("BBB080808HL8", "firmes", "FIRMES"),
    ];
    const byRfc = aggregateArt69ByRfc(rows);
    expect(byRfc.size).toBe(2);
  });
});

describe("detectExits", () => {
  it("detecta RFCs que estaban antes y ya no están (salida por diff)", () => {
    const antes = new Set(["AAA080808HL8", "BBB080808HL8"]);
    const ahora = new Set(["AAA080808HL8"]);
    const salidas = detectExits(antes, ahora, "no_localizados", "2026-07-29");
    expect(salidas).toHaveLength(1);
    expect(salidas[0].rfc).toBe("BBB080808HL8");
    expect(salidas[0].entry.esSalidaPorDiff).toBe(true);
    expect(salidas[0].entry.esResolucion).toBe(true);
    expect(salidas[0].entry.supuesto).toBe("ELIMINADO");
    expect(salidas[0].entry.fecha).toBe("2026-07-29");
    expect(salidas[0].entry.listaId).toBe("no_localizados");
  });

  it("no marca salida si el RFC sigue presente", () => {
    const antes = new Set(["AAA080808HL8"]);
    const ahora = new Set(["AAA080808HL8"]);
    expect(detectExits(antes, ahora, "firmes", "2026-07-29")).toHaveLength(0);
  });

  it("RFCs nuevos (no estaban antes) no generan salida", () => {
    const antes = new Set(["AAA080808HL8"]);
    const ahora = new Set(["AAA080808HL8", "CCC080808HL8"]);
    expect(detectExits(antes, ahora, "firmes", "2026-07-29")).toHaveLength(0);
  });
});
