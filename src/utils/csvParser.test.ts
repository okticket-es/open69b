import { describe, it, expect } from "vitest";
import { parseCsv, calculateHash } from "./csvParser";
import { Expediente, Sat69bStatus, worstSituacion } from "./types";

/**
 * Preámbulo con el formato REAL del CSV del SAT: 3 filas antes de los datos
 * (aviso legal con fecha de corte, título y fila de nombres de columna).
 */
const PREAMBLE =
  `"Información actualizada al 31 de diciembre de 2025; los listados son de carácter público",,,,,,,,,,,,,,,,,,,\n` +
  `Listado completo de contribuyentes (Artículo 69-B del CFF),,,,,,,,,,,,,,,,,,,\n` +
  `No,RFC,Nombre del Contribuyente,Situación del contribuyente,Número y fecha de oficio global de presunción SAT,Publicación página SAT presuntos,Número y fecha de oficio global de presunción DOF,Publicación DOF presuntos,Número y fecha de oficio global de contribuyentes que desvirtuaron SAT,Publicación página SAT desvirtuados,Número y fecha de oficio global de contribuyentes que desvirtuaron DOF,Publicación DOF desvirtuados,Número y fecha de oficio global de definitivos SAT,Publicación página SAT definitivos,Número y fecha de oficio global de definitivos DOF,Publicación DOF definitivos,Número y fecha de oficio global de sentencia favorable SAT,Publicación página SAT sentencia favorable,Número y fecha de oficio global de sentencia favorable DOF,Publicación DOF sentencia favorable\n`;

const ROW = (
  no: number,
  rfc: string,
  nombre: string,
  situacion: string,
): string =>
  `${no},${rfc},"${nombre}",${situacion},Oficio1 de fecha 01 de junio de 2018,01/06/2018,Oficio1,25/06/2018,,,,,,,,,,,,\n`;

describe("parseCsv — cabecera y filtrado (formato real del SAT)", () => {
  it("detecta la cabecera por contenido (3 filas de preámbulo, caso real)", () => {
    const csv = PREAMBLE + ROW(1, "AAA080808HL8", "EMPRESA UNO", "Presunto");
    const result = parseCsv(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].rfc).toBe("AAA080808HL8");
  });

  it("NO ingesta la fila de cabecera como registro", () => {
    const csv = PREAMBLE + ROW(1, "AAA080808HL8", "EMPRESA UNO", "Presunto");
    const rfcs = parseCsv(csv).entries.map((e) => e.rfc);
    expect(rfcs).not.toContain("RFC");
  });

  it("normaliza RFCs a mayúsculas (la key de Redis y la consulta lo exigen)", () => {
    const csv = PREAMBLE + ROW(1, "aaa080808hl8", "EMPRESA UNO", "Presunto");
    const result = parseCsv(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].rfc).toBe("AAA080808HL8");
  });

  it("descarta RFCs inválidos (censura judicial XXXXXXXXXXXX) y los cuenta", () => {
    const csv =
      PREAMBLE +
      ROW(1, "AAA080808HL8", "EMPRESA UNO", "Definitivo") +
      ROW(2, "XXXXXXXXXXXX", "Información suprimida por amparo", "Definitivo");
    const result = parseCsv(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.skippedInvalidRfc).toBe(1);
  });

  it("lanza error si no encuentra la cabecera (fichero corrupto/formato nuevo)", () => {
    expect(() => parseCsv("basura,sin,cabecera\n1,2,3\n")).toThrow(/cabecera/i);
  });

  it("tolera saltos de línea embebidos en el nombre (filas reales 1949/14031)", () => {
    const csv =
      PREAMBLE +
      `1,CAR160229F29,"CARYRA, S. DE R.L. DE \nC.V.",Definitivo,Of1 de fecha 01 de junio de 2018,01/06/2018,,,,,,,,,,,,,,\n`;
    const result = parseCsv(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].nombre).toContain("CARYRA");
  });
});

describe("dataCutDate", () => {
  it("extrae la fecha de corte del preámbulo real", () => {
    const csv = PREAMBLE + ROW(1, "AAA080808HL8", "EMPRESA", "Presunto");
    expect(parseCsv(csv).dataCutDate).toBe("2025-12-31");
  });

  it("null si el preámbulo no trae fecha (sin romper el parseo)", () => {
    const csv =
      "cabecera rara,,,,,,,,,,,,,,,,,,,\n" +
      PREAMBLE.split("\n").slice(2).join("\n") +
      ROW(1, "AAA080808HL8", "EMPRESA", "Presunto");
    const result = parseCsv(csv);
    expect(result.dataCutDate).toBeNull();
    expect(result.entries).toHaveLength(1);
  });
});

describe("agregación multi-expediente", () => {
  const EMPTY_STEP = {
    oficioSat: null,
    fechaSat: null,
    oficioDof: null,
    fechaDof: null,
  };
  const exp = (s: Sat69bStatus): Expediente => ({
    situacion: s,
    presuncion: EMPTY_STEP,
    desvirtuado: EMPTY_STEP,
    definitivo: EMPTY_STEP,
    sentenciaFavorable: EMPTY_STEP,
  });

  it("agrupa filas del mismo RFC en expedientes[] (caso real AAS110331G59)", () => {
    const csv =
      PREAMBLE +
      ROW(155, "AAS110331G59", "EMPRESA DOS", "Definitivo") +
      ROW(156, "AAS110331G59", "EMPRESA DOS", "Sentencia Favorable");
    const { records } = parseCsv(csv);
    expect(records).toHaveLength(1);
    expect(records[0].expedientes).toHaveLength(2);
  });

  it("la situación del record es la MÁS SEVERA entre expedientes", () => {
    const csv =
      PREAMBLE +
      ROW(1, "AAS110331G59", "EMPRESA DOS", "Sentencia Favorable") +
      ROW(2, "AAS110331G59", "EMPRESA DOS", "Definitivo");
    const { records } = parseCsv(csv);
    // hoy "gana la última fila"; el criterio correcto es la más severa
    expect(records[0].situacion).toBe(Sat69bStatus.DEFINITIVO);
  });

  it("orden de severidad: Definitivo > Presunto > Desvirtuado > Sentencia Favorable", () => {
    expect(
      worstSituacion([
        exp(Sat69bStatus.SENTENCIA_FAVORABLE),
        exp(Sat69bStatus.PRESUNTO),
      ]),
    ).toBe(Sat69bStatus.PRESUNTO);
    expect(worstSituacion([exp(Sat69bStatus.DESVIRTUADO)])).toBe(
      Sat69bStatus.DESVIRTUADO,
    );
    expect(worstSituacion([])).toBeNull();
  });
});

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

      const { entries: records } = parseCsv(csv);
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

      const { entries: records } = parseCsv(csv);
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

      const { entries: records } = parseCsv(csv);
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

      const { entries: records } = parseCsv(csv);
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

      const { entries: records } = parseCsv(csv);
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

      const { entries: records } = parseCsv(csv);
      expect(records).toHaveLength(3);
    });

    it("retorna array vacío para CSV vacío", () => {
      const csv = [HEADER_ROW_1, HEADER_ROW_2].join("\n");
      const { entries: records } = parseCsv(csv);
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
