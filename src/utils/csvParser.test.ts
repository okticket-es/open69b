import { describe, it, expect } from "vitest";
import { parseCsv, calculateHash } from "./csvParser";

describe("csvParser", () => {
  describe("parseCsv", () => {
    const HEADER_ROW_1 = "Info row 1";
    const HEADER_ROW_2 =
      "No,RFC,Nombre,Situacion,PresOficioSAT,PresFechaSAT,PresOficioDOF,PresFechaDOF,DesvOficioSAT,DesvFechaSAT,DesvOficioDOF,DesvFechaDOF,DefOficioSAT,DefFechaSAT,DefOficioDOF,DefFechaDOF,SentOficioSAT,SentFechaSAT,SentOficioDOF,SentFechaDOF";

    it("parsea un registro válido correctamente", () => {
      const csv = [
        HEADER_ROW_1,
        HEADER_ROW_2,
        "1,AAA080808HL8,EMPRESA TEST SA DE CV,Definitivo,Oficio1,01/01/2020,Oficio1,02/01/2020,,,,,,,,,,,,",
      ].join("\n");

      const records = parseCsv(csv);
      expect(records).toHaveLength(1);
      expect(records[0].rfc).toBe("AAA080808HL8");
      expect(records[0].nombre).toBe("EMPRESA TEST SA DE CV");
      expect(records[0].situacion).toBe("Definitivo");
    });

    it("extrae correctamente los pasos del proceso", () => {
      const csv = [
        HEADER_ROW_1,
        HEADER_ROW_2,
        "1,AAA080808HL8,TEST,Sentencia Favorable,PresOficio,01/01/2020,PresDOF,02/01/2020,DesvOficio,03/01/2020,DesvDOF,04/01/2020,DefOficio,05/01/2020,DefDOF,06/01/2020,SentOficio,07/01/2020,SentDOF,08/01/2020",
      ].join("\n");

      const records = parseCsv(csv);
      expect(records[0].presuncion).toEqual({
        oficioSat: "PresOficio",
        fechaSat: "01/01/2020",
        oficioDof: "PresDOF",
        fechaDof: "02/01/2020",
      });
      expect(records[0].desvirtuado).toEqual({
        oficioSat: "DesvOficio",
        fechaSat: "03/01/2020",
        oficioDof: "DesvDOF",
        fechaDof: "04/01/2020",
      });
      expect(records[0].definitivo).toEqual({
        oficioSat: "DefOficio",
        fechaSat: "05/01/2020",
        oficioDof: "DefDOF",
        fechaDof: "06/01/2020",
      });
      expect(records[0].sentenciaFavorable).toEqual({
        oficioSat: "SentOficio",
        fechaSat: "07/01/2020",
        oficioDof: "SentDOF",
        fechaDof: "08/01/2020",
      });
    });

    it("maneja valores vacíos como null", () => {
      const csv = [
        HEADER_ROW_1,
        HEADER_ROW_2,
        "1,AAA080808HL8,TEST,Presunto,,,,,,,,,,,,,,,,",
      ].join("\n");

      const records = parseCsv(csv);
      expect(records[0].presuncion.oficioSat).toBeNull();
      expect(records[0].presuncion.fechaSat).toBeNull();
    });

    it("salta las primeras 2 filas de encabezado", () => {
      const csv = [
        HEADER_ROW_1,
        HEADER_ROW_2,
        "1,AAA080808HL8,TEST1,Presunto,,,,,,,,,,,,,,,,",
        "2,BBB080808HL8,TEST2,Definitivo,,,,,,,,,,,,,,,,",
      ].join("\n");

      const records = parseCsv(csv);
      expect(records).toHaveLength(2);
      expect(records[0].rfc).toBe("AAA080808HL8");
      expect(records[1].rfc).toBe("BBB080808HL8");
    });

    it("ignora filas sin RFC", () => {
      const csv = [
        HEADER_ROW_1,
        HEADER_ROW_2,
        "1,,TEST,Presunto,,,,,,,,,,,,,,,,",
        "2,AAA080808HL8,TEST2,Definitivo,,,,,,,,,,,,,,,,",
      ].join("\n");

      const records = parseCsv(csv);
      expect(records).toHaveLength(1);
      expect(records[0].rfc).toBe("AAA080808HL8");
    });

    it("parsea múltiples registros", () => {
      const csv = [
        HEADER_ROW_1,
        HEADER_ROW_2,
        "1,AAA080808HL8,TEST1,Presunto,,,,,,,,,,,,,,,,",
        "2,BBB080808HL8,TEST2,Definitivo,,,,,,,,,,,,,,,,",
        "3,CCC080808HL8,TEST3,Sentencia Favorable,,,,,,,,,,,,,,,,",
      ].join("\n");

      const records = parseCsv(csv);
      expect(records).toHaveLength(3);
    });

    it("retorna array vacío para CSV vacío", () => {
      const csv = [HEADER_ROW_1, HEADER_ROW_2].join("\n");
      const records = parseCsv(csv);
      expect(records).toHaveLength(0);
    });
  });

  describe("calculateHash", () => {
    it("genera hash SHA256 consistente", async () => {
      const content = "test content";
      const hash1 = await calculateHash(content);
      const hash2 = await calculateHash(content);
      expect(hash1).toBe(hash2);
    });

    it("genera hashes diferentes para contenido diferente", async () => {
      const hash1 = await calculateHash("content 1");
      const hash2 = await calculateHash("content 2");
      expect(hash1).not.toBe(hash2);
    });

    it("retorna string hexadecimal de 64 caracteres", async () => {
      const hash = await calculateHash("test");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
