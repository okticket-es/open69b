import { describe, it, expect } from "vitest";
import {
  isValidRfc,
  normalizeRfc,
  validateAndNormalizeRfc,
} from "./rfcValidator";

describe("rfcValidator", () => {
  describe("normalizeRfc", () => {
    it("convierte a mayúsculas", () => {
      expect(normalizeRfc("abc123456xyz")).toBe("ABC123456XYZ");
    });

    it("elimina espacios", () => {
      expect(normalizeRfc("  ABC123456XYZ  ")).toBe("ABC123456XYZ");
    });

    it("retorna string vacío para valores inválidos", () => {
      expect(normalizeRfc("")).toBe("");
      expect(normalizeRfc(null as unknown as string)).toBe("");
      expect(normalizeRfc(undefined as unknown as string)).toBe("");
    });
  });

  describe("isValidRfc", () => {
    describe("persona moral (3 letras)", () => {
      it("acepta RFC válido de persona moral", () => {
        expect(isValidRfc("AAA080808HL8")).toBe(true);
        expect(isValidRfc("XYZ991231AB1")).toBe(true);
      });

      it("acepta RFC con Ñ", () => {
        expect(isValidRfc("AÑA080808HL8")).toBe(true);
      });

      it("acepta RFC con &", () => {
        expect(isValidRfc("A&A080808HL8")).toBe(true);
      });
    });

    describe("persona física (4 letras)", () => {
      it("acepta RFC válido de persona física", () => {
        expect(isValidRfc("GARC850101AB1")).toBe(true);
        expect(isValidRfc("XAXX010101000")).toBe(true);
      });
    });

    describe("normalización implícita", () => {
      it("acepta minúsculas", () => {
        expect(isValidRfc("aaa080808hl8")).toBe(true);
      });

      it("acepta con espacios", () => {
        expect(isValidRfc("  AAA080808HL8  ")).toBe(true);
      });
    });

    describe("rechaza RFCs inválidos", () => {
      it("rechaza RFC muy corto", () => {
        expect(isValidRfc("AAA08080")).toBe(false);
      });

      it("rechaza RFC muy largo", () => {
        expect(isValidRfc("AAAAA080808HL8X")).toBe(false);
      });

      it("rechaza RFC con caracteres especiales", () => {
        expect(isValidRfc("AAA@80808HL8")).toBe(false);
      });

      it("rechaza valores vacíos o nulos", () => {
        expect(isValidRfc("")).toBe(false);
        expect(isValidRfc(null as unknown as string)).toBe(false);
        expect(isValidRfc(undefined as unknown as string)).toBe(false);
      });

      it("rechaza RFC con fecha inválida (no dígitos)", () => {
        expect(isValidRfc("AAAABCDEFHL8")).toBe(false);
      });
    });
  });

  describe("validateAndNormalizeRfc", () => {
    it("retorna RFC normalizado si es válido", () => {
      expect(validateAndNormalizeRfc("aaa080808hl8")).toBe("AAA080808HL8");
    });

    it("lanza error si RFC es inválido", () => {
      expect(() => validateAndNormalizeRfc("invalid")).toThrow(
        "RFC inválido: invalid",
      );
    });

    it("lanza error si RFC está vacío", () => {
      expect(() => validateAndNormalizeRfc("")).toThrow("RFC inválido:");
    });
  });
});
