import { describe, expect, it } from "vitest";
import { findColumnIndex, normalizeColumnName } from "@/art69/columnMatcher";

describe("normalizeColumnName", () => {
  it("normaliza espacios, mayúsculas y acentos", () => {
    expect(normalizeColumnName(" MONTO ")).toBe("MONTO");
    expect(normalizeColumnName("Entidad Federativa")).toBe(
      "ENTIDAD FEDERATIVA",
    );
    expect(normalizeColumnName("FECHA DE PUBLICACIÓN")).toBe(
      "FECHA DE PUBLICACION",
    );
    expect(normalizeColumnName(" Importe condonado ")).toBe(
      "IMPORTE CONDONADO",
    );
  });

  it("colapsa espacios múltiples", () => {
    expect(normalizeColumnName("RAZÓN   SOCIAL")).toBe("RAZON SOCIAL");
  });
});

describe("findColumnIndex", () => {
  it("encuentra la columna ignorando espacios/acentos/mayúsculas", () => {
    const header = ["RFC", " MONTO ", "Entidad Federativa"];
    expect(findColumnIndex(header, "MONTO")).toBe(1);
    expect(findColumnIndex(header, "ENTIDAD FEDERATIVA")).toBe(2);
  });

  it("devuelve -1 si no existe", () => {
    expect(findColumnIndex(["RFC", "NOMBRE"], "MONTO")).toBe(-1);
  });

  it("caso real: 'Ano' (config, sin acento) encuentra 'Año' (cabecera real)", () => {
    expect(findColumnIndex(["Año", "RFC"], "Ano")).toBe(0);
  });
});
