import { describe, expect, it } from "vitest";
import { decodeCsvBuffer } from "@/utils/encoding";
import { calculateHash } from "@/utils/csvParser";

describe("decodeCsvBuffer", () => {
  it("decodifica windows-1252 (CSV real del SAT) sin corromper acentos", () => {
    // "Información" con ó = 0xF3, como en el CSV real
    const cp1252 = Buffer.from("Informaci\xf3n del SAT, AVAL\xdaOS", "latin1");
    expect(decodeCsvBuffer(cp1252)).toBe("Información del SAT, AVALÚOS");
  });

  it("decodifica UTF-8 válido tal cual", () => {
    const utf8 = new TextEncoder().encode("Información ÑÁÉ");
    expect(decodeCsvBuffer(utf8)).toBe("Información ÑÁÉ");
  });

  it("no produce U+FFFD con bytes cp1252", () => {
    const cp1252 = Buffer.from("PE\xd1A", "latin1");
    expect(decodeCsvBuffer(cp1252)).not.toContain("�");
  });
});

describe("calculateHash", () => {
  it("mismo hash para los mismos bytes, distinto para bytes distintos", async () => {
    const a = Buffer.from("abc", "latin1");
    expect(await calculateHash(a)).toBe(
      await calculateHash(Buffer.from("abc", "latin1")),
    );
    expect(await calculateHash(a)).not.toBe(
      await calculateHash(Buffer.from("abd", "latin1")),
    );
  });

  it("sigue aceptando string (compatibilidad)", async () => {
    expect(await calculateHash("abc")).toHaveLength(64);
  });
});
