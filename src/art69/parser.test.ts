import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { decodeCsvBuffer } from "@/utils/encoding";
import { parseArt69Csv, extractRfcs } from "@/art69/parser";
import { ART69_LISTS } from "@/art69/listConfigs";

const DIR =
  process.env.ART69_FIXTURES_DIR ??
  "/private/tmp/claude-501/-Users-enol-repos-okt-api/aaf46850-2fa3-4b6d-8ac1-07289c7aa1fb/scratchpad/art69";

function loadReal(id: string): string {
  const raw = readFileSync(`${DIR}/${id}.csv`);
  return decodeCsvBuffer(raw);
}

describe.skipIf(!existsSync(DIR))(
  "parseArt69Csv — con CSVs reales del SAT",
  () => {
    it("no_localizados: RFC, nombre y fecha correctos (fila real)", () => {
      const config = ART69_LISTS.find((l) => l.id === "no_localizados")!;
      const { entries, skippedInvalidRfc } = parseArt69Csv(
        loadReal("no_localizados"),
        config,
      );
      expect(entries.length).toBeGreaterThan(50000);
      expect(skippedInvalidRfc).toBe(0);
      const first = entries[0];
      expect(first.rfc).toBe("DMC990622AG8");
      expect(first.entry.fecha).toBe("2014-01-01");
      expect(first.entry.supuesto).toBe("NO LOCALIZADOS");
      expect(first.entry.esResolucion).toBe(false);
    });

    it("cancelados: monto normalizado (comas y comillas) y esResolucion=true", () => {
      const config = ART69_LISTS.find((l) => l.id === "cancelados")!;
      const { entries } = parseArt69Csv(loadReal("cancelados"), config);
      const fila = entries.find((e) => e.rfc === "&HI0102165P2");
      expect(fila).toBeDefined();
      expect(fila!.entry.monto).toBe(1390273);
      expect(fila!.entry.supuesto).toBe("CANCELADOS POR INSOLVENCIA");
      expect(fila!.entry.esResolucion).toBe(true);
    });

    it("condonados_07_15: soloAnio → fecha 1 de enero del año, importe con comas", () => {
      const config = ART69_LISTS.find((l) => l.id === "condonados_07_15")!;
      const { entries } = parseArt69Csv(loadReal("condonados_07_15"), config);
      const fila = entries.find((e) => e.rfc === "AAA390128530");
      expect(fila).toBeDefined();
      expect(fila!.entry.fecha).toBe("2007-01-01");
      expect(fila!.entry.monto).toBe(11691833);
      expect(fila!.entry.supuesto).toBe("CONDONADOS");
    });

    it("cancelados_07_15: soloAnio + IMPORTE (columna sin espacio inicial en el nombre real)", () => {
      const config = ART69_LISTS.find((l) => l.id === "cancelados_07_15")!;
      const { entries } = parseArt69Csv(loadReal("cancelados_07_15"), config);
      const fila = entries.find((e) => e.rfc === "ASO811001LB7");
      expect(fila).toBeDefined();
      expect(fila!.entry.fecha).toBe("2007-01-01");
      expect(fila!.entry.monto).toBe(1378841);
      expect(fila!.entry.supuesto).toBe("CANCELADOS");
    });

    it("csd_sin_efectos: sin monto ni entidad, supuesto = fracción", () => {
      const config = ART69_LISTS.find((l) => l.id === "csd_sin_efectos")!;
      const { entries } = parseArt69Csv(loadReal("csd_sin_efectos"), config);
      const fila = entries.find((e) => e.rfc === "GTM870825HA7");
      expect(fila).toBeDefined();
      expect(fila!.entry.monto).toBeNull();
      expect(fila!.entry.entidadFederativa).toBeNull();
      expect(fila!.entry.supuesto).toBe("FRACCION X");
    });

    it("entes_publicos: sin monto ni entidad, fecha de primera publicación", () => {
      const config = ART69_LISTS.find((l) => l.id === "entes_publicos")!;
      const { entries } = parseArt69Csv(loadReal("entes_publicos"), config);
      const fila = entries.find((e) => e.rfc === "MZA850101LF7");
      expect(fila).toBeDefined();
      expect(fila!.entry.fecha).toBe("2024-07-23");
      expect(fila!.entry.supuesto).toBe("FRACCION VII");
    });

    it("condonados_146b: entidad con nombre de columna en minúsculas ('Entidad Federativa')", () => {
      const config = ART69_LISTS.find((l) => l.id === "condonados_146b")!;
      const { entries } = parseArt69Csv(loadReal("condonados_146b"), config);
      const fila = entries.find((e) => e.rfc === "CGE891231NH6");
      expect(fila).toBeDefined();
      expect(fila!.entry.entidadFederativa).toBe("CIUDAD DE MEXICO");
      expect(fila!.entry.monto).toBe(2714414716);
    });

    it("reduccion_art74: family evento, esResolucion=false", () => {
      const config = ART69_LISTS.find((l) => l.id === "reduccion_art74")!;
      const { entries } = parseArt69Csv(loadReal("reduccion_art74"), config);
      const fila = entries.find((e) => e.rfc === "AEI961104910");
      expect(fila).toBeDefined();
      expect(fila!.entry.esResolucion).toBe(false);
      expect(fila!.entry.monto).toBeNull(); // celda vacía en la fila real
    });

    it("todas las 14 listas parsean sin lanzar y devuelven filas", () => {
      for (const config of ART69_LISTS) {
        const { entries } = parseArt69Csv(loadReal(config.id), config);
        expect(entries.length, `lista ${config.id} sin filas`).toBeGreaterThan(
          0,
        );
      }
    });

    it("descarta RFCs con formato inválido y los cuenta", () => {
      const config = ART69_LISTS.find((l) => l.id === "firmes")!;
      const csv =
        "RFC,RAZON SOCIAL,TIPO PERSONA,SUPUESTO,FECHA DE PRIMERA PUBLICACION,ENTIDAD FEDERATIVA\n" +
        "AAA080808HL8,VALIDO,M,FIRMES,01/01/2020,CDMX\n" +
        "XXXXXXXXXXXX,INVALIDO,M,FIRMES,01/01/2020,CDMX\n";
      const { entries, skippedInvalidRfc } = parseArt69Csv(csv, config);
      expect(entries).toHaveLength(1);
      expect(skippedInvalidRfc).toBe(1);
    });

    it("extractRfcs devuelve el mismo conjunto que parseArt69Csv, sin construir entries completas", () => {
      const config = ART69_LISTS.find((l) => l.id === "no_localizados")!;
      const { entries } = parseArt69Csv(loadReal("no_localizados"), config);
      const rfcs = extractRfcs(loadReal("no_localizados"), config);
      expect(rfcs.size).toBe(entries.length);
      expect(rfcs.has(entries[0].rfc)).toBe(true);
    });

    it("extractRfcs también descarta RFCs inválidos", () => {
      const config = ART69_LISTS.find((l) => l.id === "firmes")!;
      const csv =
        "RFC,RAZON SOCIAL,TIPO PERSONA,SUPUESTO,FECHA DE PRIMERA PUBLICACION,ENTIDAD FEDERATIVA\n" +
        "AAA080808HL8,VALIDO,M,FIRMES,01/01/2020,CDMX\n" +
        "XXXXXXXXXXXX,INVALIDO,M,FIRMES,01/01/2020,CDMX\n";
      expect(extractRfcs(csv, config)).toEqual(new Set(["AAA080808HL8"]));
    });

    it("lanza error claro si no encuentra la columna RFC o fecha", () => {
      const config = ART69_LISTS.find((l) => l.id === "firmes")!;
      expect(() => parseArt69Csv("COLUMNA_RARA,OTRA\nX,Y\n", config)).toThrow(
        /firmes/,
      );
    });
  },
);
