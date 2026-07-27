import { describe, expect, it } from "vitest";
import { parseSatDate } from "@/utils/dates";

describe("parseSatDate — fechas de publicación del CSV real", () => {
  it("dd/mm/yyyy estándar (99,7% de las celdas)", () => {
    expect(parseSatDate("01/06/2018")).toBe("2018-06-01");
    expect(parseSatDate("25/06/2018")).toBe("2018-06-25");
  });

  it("pares 'A - B' → primera fecha (anomalía real)", () => {
    expect(parseSatDate("19/07/2018 - 30/10/18")).toBe("2018-07-19");
    expect(parseSatDate("26/10/2023 - 26/04/2022 - 14/12/2020")).toBe(
      "2023-10-26",
    );
  });

  it("año de 2 dígitos → 20xx (anomalía real)", () => {
    expect(parseSatDate("14/05/19 - 21/11/2017")).toBe("2019-05-14");
  });

  it("separador guion, incluso sin espacio tras el par (anomalía real)", () => {
    expect(parseSatDate("01-12-2023- 23/05/2023")).toBe("2023-12-01");
  });

  it("dobles espacios sin guion → primera fecha (anomalía real)", () => {
    expect(parseSatDate("17/10/2019    27/08/2018")).toBe("2019-10-17");
  });

  it("serial de Excel (anomalías reales 44014/44029)", () => {
    expect(parseSatDate("44014")).toBe("2020-07-02");
    expect(parseSatDate("44029")).toBe("2020-07-17");
  });

  it("null, vacío y basura → null", () => {
    expect(parseSatDate(null)).toBeNull();
    expect(parseSatDate("")).toBeNull();
    expect(parseSatDate("sin fecha alguna")).toBeNull();
    expect(parseSatDate("99/99/2020")).toBeNull();
  });
});
