/**
 * Tests de la lógica de fallo permanente de putArt69Records (hallazgo
 * crítico de la review: antes, agotar los reintentos hacía perder los
 * records EN SILENCIO y aun así se contaban como "written"). Se mockea
 * el SDK completo porque DynamoDB Local no reproduce throttling real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(),
}));

// las tres deben ser invocables con `new` (el código fuente hace
// `new BatchGetCommand(...)`); vi.fn() con arrow function no sirve para
// eso — hace falta `function` para que tenga [[Construct]].
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: (): { send: typeof sendMock } => ({ send: sendMock }),
  },
  BatchGetCommand: vi.fn(function BatchGetCommand(input: unknown) {
    return { __type: "BatchGetCommand", input };
  }),
  BatchWriteCommand: vi.fn(function BatchWriteCommand(input: unknown) {
    return { __type: "BatchWriteCommand", input };
  }),
  GetCommand: vi.fn(function GetCommand(input: unknown) {
    return { __type: "GetCommand", input };
  }),
}));

/** Nombre de tabla real que usa el módulo bajo test (lee ART69_TABLE_NAME,
 * igual que dynamoStore.ts) — evita hardcodear el literal por defecto. */

interface MockCommand {
  __type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: { RequestItems: Record<string, any> };
}

function tableItems<T>(requestItems: Record<string, T>): T {
  const key = Object.keys(requestItems)[0];
  return requestItems[key];
}

function record(rfc: string): {
  rfc: string;
  nombre: string;
  entries: Array<{
    listaId: string;
    family: "estado";
    supuesto: string;
    fecha: string;
    monto: null;
    entidadFederativa: null;
    esResolucion: boolean;
  }>;
} {
  return {
    rfc,
    nombre: "TEST",
    entries: [
      {
        listaId: "firmes",
        family: "estado" as const,
        supuesto: "FIRMES",
        fecha: "2020-01-01",
        monto: null,
        entidadFederativa: null,
        esResolucion: false,
      },
    ],
  };
}

describe("putArt69Records — fallo permanente (throttling sostenido)", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("un lote que sigue con UnprocessedItems tras agotar reintentos NO se cuenta como escrito", async () => {
    sendMock.mockImplementation((cmd: MockCommand) => {
      if (cmd.__type === "BatchGetCommand") {
        return Promise.resolve({
          Responses: { [Object.keys(cmd.input.RequestItems)[0]]: [] },
        });
      }
      // BatchWriteCommand: siempre devuelve el item como no-procesado
      const item = tableItems(cmd.input.RequestItems)[0].PutRequest.Item;
      return Promise.resolve({
        UnprocessedItems: {
          [Object.keys(cmd.input.RequestItems)[0]]: [
            { PutRequest: { Item: item } },
          ],
        },
      });
    });

    const { putArt69Records } = await import("@/art69/dynamoStore");
    const result = await putArt69Records([record("AAA080808HL8")]);

    expect(result.written).toBe(0); // NUNCA se cuenta como escrito
    expect(result.failed).toBe(1); // y el fallo queda visible, no oculto
  }, 15000);

  it("records que SÍ se escriben (sin UnprocessedItems) cuentan como written, no como failed", async () => {
    sendMock.mockImplementation((cmd: MockCommand) => {
      if (cmd.__type === "BatchGetCommand") {
        return Promise.resolve({
          Responses: { [Object.keys(cmd.input.RequestItems)[0]]: [] },
        });
      }
      return Promise.resolve({}); // sin UnprocessedItems: todo escrito
    });

    const { putArt69Records } = await import("@/art69/dynamoStore");
    const result = await putArt69Records([
      record("AAA080808HL8"),
      record("BBB080808HL8"),
    ]);

    expect(result.written).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("un lote de BatchGet que lanza una excepción no aborta el sync: se trata como sin datos previos", async () => {
    let getCalls = 0;
    sendMock.mockImplementation((cmd: MockCommand) => {
      if (cmd.__type === "BatchGetCommand") {
        getCalls++;
        return Promise.reject(
          new Error("ProvisionedThroughputExceededException"),
        );
      }
      return Promise.resolve({}); // el write sigue funcionando igual
    });

    const { putArt69Records } = await import("@/art69/dynamoStore");
    const result = await putArt69Records([record("AAA080808HL8")]);

    expect(getCalls).toBeGreaterThan(0);
    expect(result.written).toBe(1); // el fallo del Get no bloqueó el write
    expect(result.failed).toBe(0);
  });

  it("BatchGetItem con más de 100 RFCs se divide en varios lotes", async () => {
    const requestedKeys: number[] = [];
    sendMock.mockImplementation((cmd: MockCommand) => {
      if (cmd.__type === "BatchGetCommand") {
        requestedKeys.push(tableItems(cmd.input.RequestItems).Keys.length);
        return Promise.resolve({
          Responses: { [Object.keys(cmd.input.RequestItems)[0]]: [] },
        });
      }
      return Promise.resolve({});
    });

    const { putArt69Records } = await import("@/art69/dynamoStore");
    const records = Array.from({ length: 150 }, (_, i) =>
      record(`RFC${String(i).padStart(9, "0")}`),
    );
    await putArt69Records(records);

    expect(requestedKeys.length).toBe(2); // 100 + 50
    expect(requestedKeys.reduce((a, b) => a + b, 0)).toBe(150);
  });

  it("un item corrupto en Dynamo (sin entries) no revienta el merge del sync", async () => {
    sendMock.mockImplementation((cmd: MockCommand) => {
      if (cmd.__type === "BatchGetCommand") {
        // item legacy/corrupto: existe pero sin array entries
        return Promise.resolve({
          Responses: {
            [Object.keys(cmd.input.RequestItems)[0]]: [
              { rfc: "AAA080808HL8", nombre: "CORRUPTO" },
            ],
          },
        });
      }
      return Promise.resolve({});
    });

    const { putArt69Records } = await import("@/art69/dynamoStore");
    const result = await putArt69Records([record("AAA080808HL8")]);
    expect(result.written).toBe(1);
    expect(result.failed).toBe(0);
  });
});
