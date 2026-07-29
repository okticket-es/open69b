import { beforeEach, describe, expect, it, vi } from "vitest";
import { ART69_LISTS } from "@/art69/listConfigs";
import { Art69ListConfig } from "@/art69/types";

vi.mock("@/art69/dynamoStore", () => ({
  putArt69Records: vi.fn().mockResolvedValue({ written: 0, failed: 0 }),
}));
vi.mock("@/art69/snapshotStore", () => ({
  readPreviousSnapshot: vi.fn().mockResolvedValue(null),
  writeSnapshot: vi.fn().mockResolvedValue(undefined),
}));

/** Construye un CSV mínimo cuyas columnas coinciden EXACTAMENTE con las
 * que espera esta config concreta (una fila con RFC fijo, para probar
 * la orquestación sin depender del detalle de cada esquema real). */
function fixtureFor(config: Art69ListConfig, rfc: string): string {
  const cols = [config.rfcColumn, config.nombreColumn];
  const values = [rfc, "EMPRESA TEST"];
  if (config.supuestoColumn) {
    cols.push(config.supuestoColumn);
    values.push(config.fixedSupuesto ?? "SUPUESTO");
  }
  cols.push(config.fechaColumn);
  values.push(config.soloAnio ? "2020" : "01/01/2020");
  if (config.montoColumn) {
    cols.push(config.montoColumn);
    values.push("1000");
  }
  if (config.entidadColumn) {
    cols.push(config.entidadColumn);
    values.push("CDMX");
  }
  return `${cols.join(",")}\n${values.join(",")}\n`;
}

const byUrl = new Map(
  ART69_LISTS.map((c) => [c.url, fixtureFor(c, "AAA080808HL8")]),
);

describe("syncArt69", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks no restaura mockResolvedValue/mockRejectedValue puesto
    // por un test anterior: volver siempre al default antes de cada test.
    const snapshotStore = await import("@/art69/snapshotStore");
    vi.mocked(snapshotStore.readPreviousSnapshot).mockResolvedValue(null);
    const dynamoStore = await import("@/art69/dynamoStore");
    vi.mocked(dynamoStore.putArt69Records).mockResolvedValue({
      written: 0,
      failed: 0,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const content = byUrl.get(url);
        if (!content) throw new Error(`fixture no definido para ${url}`);
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(content).buffer,
        });
      }),
    );
  });

  it("descarga las 14 listas, agrega por RFC entre listas y escribe a Dynamo", async () => {
    const { syncArt69 } = await import("@/services/art69Sync");
    const dynamo = await import("@/art69/dynamoStore");
    const result = await syncArt69();
    expect(result.listasOk).toBe(14);
    expect(result.listasFallidas).toHaveLength(0);
    expect(vi.mocked(dynamo.putArt69Records)).toHaveBeenCalledTimes(1);

    // AAA080808HL8 aparece en varias listas (todas devuelven ese RFC en el mock):
    // debe fusionarse en UN solo record con varias entries
    const written = vi.mocked(dynamo.putArt69Records).mock.calls[0][0];
    const record = written.find((r) => r.rfc === "AAA080808HL8");
    expect(record).toBeDefined();
    expect(record!.entries.length).toBe(14);
  });

  it("detecta salidas por diff cuando el snapshot anterior tenía más RFCs", async () => {
    const snapshotStore = await import("@/art69/snapshotStore");
    vi.mocked(snapshotStore.readPreviousSnapshot).mockResolvedValue(
      "RFC,RAZON SOCIAL,TIPO PERSONA,SUPUESTO,FECHA DE PRIMERA PUBLICACION,ENTIDAD FEDERATIVA\n" +
        "AAA080808HL8,EMPRESA UNO,M,FIRMES,01/01/2020,CDMX\n" +
        "BBB080808HL8,EMPRESA DOS,M,FIRMES,01/01/2020,CDMX\n",
    );
    const { syncArt69 } = await import("@/services/art69Sync");
    const dynamo = await import("@/art69/dynamoStore");
    await syncArt69();
    const written = vi.mocked(dynamo.putArt69Records).mock.calls[0][0];
    const salida = written.find((r) => r.rfc === "BBB080808HL8");
    expect(salida).toBeDefined();
    expect(salida!.entries.some((e) => e.esSalidaPorDiff)).toBe(true);
  });

  it("reporta rfcsEscritos/rfcsFallidos del resultado de putArt69Records", async () => {
    const dynamo = await import("@/art69/dynamoStore");
    vi.mocked(dynamo.putArt69Records).mockResolvedValue({
      written: 10,
      failed: 4,
    });
    const { syncArt69 } = await import("@/services/art69Sync");
    const result = await syncArt69();
    expect(result.rfcsEscritos).toBe(10);
    expect(result.rfcsFallidos).toBe(4);
  });

  it("un fallo DURO al persistir en Dynamo no descarta los resultados ya calculados de las 14 listas", async () => {
    const dynamo = await import("@/art69/dynamoStore");
    vi.mocked(dynamo.putArt69Records).mockRejectedValue(
      new Error("DynamoDB down"),
    );
    const { syncArt69 } = await import("@/services/art69Sync");
    const result = await syncArt69();
    expect(result.listasOk).toBe(14); // las 14 listas SÍ se descargaron/parsearon bien
    expect(result.rfcsTotal).toBeGreaterThan(0);
    expect(result.rfcsEscritos).toBe(0);
    expect(result.rfcsFallidos).toBe(result.rfcsTotal); // se reporta el fallo, no se oculta
  });

  it("una lista que falla no aborta el sync completo (fail-open por lista)", async () => {
    vi.mocked(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (url: string) => {
        if (url.includes("Firmes.csv")) {
          return Promise.reject(new Error("network down"));
        }
        const content = byUrl.get(url);
        if (!content) throw new Error(`fixture no definido para ${url}`);
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(content).buffer,
        });
      },
    );
    const { syncArt69 } = await import("@/services/art69Sync");
    const result = await syncArt69();
    expect(result.listasOk).toBe(13);
    expect(result.listasFallidas).toEqual(["firmes"]);
  });
}, 30000);
