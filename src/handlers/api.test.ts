import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { APIGatewayProxyEventV2, Context, ScheduledEvent } from "aws-lambda";

// mock services antes de importar el handler
vi.mock("@/services/sat69bRedis", () => ({
  getRecordByRfc: vi.fn(),
  getMetadata: vi.fn().mockResolvedValue({
    lastSyncAt: new Date().toISOString(),
    status: "success",
    rowCount: 14000,
    csvHash: "abc123def456789012345678901234567890",
    csvSize: 4500000,
    syncDuration: 5000,
    errorMessage: null,
  }),
  setRecord: vi.fn(),
  bulkSetRecords: vi.fn(),
  setMetadata: vi.fn(),
  countRecords: vi.fn().mockResolvedValue(100),
  healthCheck: vi.fn().mockResolvedValue(true),
  clearAllRecords: vi.fn(),
}));

vi.mock("@/services/csvSync", () => ({
  syncFromSat: vi.fn().mockResolvedValue({
    success: true,
    rowCount: 100,
    csvHash: "abc123",
  }),
}));

// helper para crear eventos mock
function createMockEvent(
  path: string,
  method: string,
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    requestContext: {
      http: { method },
    },
    headers,
    pathParameters: {},
  } as unknown as APIGatewayProxyEventV2;
}

function createMockContext(): Context {
  return {
    functionName: "test",
    awsRequestId: "test-123",
  } as unknown as Context;
}

describe("API Handler", () => {
  const originalEnv = process.env.API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.API_KEY = originalEnv;
  });

  describe("routing", () => {
    it("retorna 404 para rutas desconocidas", async () => {
      // importar dinámicamente para que los mocks apliquen
      const { handler } = await import("./api");
      const event = createMockEvent("/unknown", "GET");
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      expect(result.statusCode).toBe(404);
    });

    it("enruta /health correctamente", async () => {
      const { handler } = await import("./api");
      const event = createMockEvent("/health", "GET");
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      expect(result.statusCode).toBe(200);
    });

    it("enruta /metadata correctamente", async () => {
      const { handler } = await import("./api");
      const event = createMockEvent("/metadata", "GET");
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      expect(result.statusCode).toBe(200);
    });
  });

  describe("autenticación", () => {
    it("permite acceso sin API_KEY configurada", async () => {
      delete process.env.API_KEY;

      // re-importar para aplicar el nuevo env
      vi.resetModules();
      const { handler } = await import("./api");

      const event = createMockEvent("/status/AAA080808HL8", "GET");
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      // no debería ser 401
      expect(result.statusCode).not.toBe(401);
    });

    it("rechaza petición sin API key cuando está configurada", async () => {
      process.env.API_KEY = "test-secret-key";

      vi.resetModules();
      const { handler } = await import("./api");

      const event = createMockEvent("/status/AAA080808HL8", "GET");
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      expect(result.statusCode).toBe(401);
    });

    it("rechaza petición con API key incorrecta", async () => {
      process.env.API_KEY = "test-secret-key";

      vi.resetModules();
      const { handler } = await import("./api");

      const event = createMockEvent("/status/AAA080808HL8", "GET", {
        "x-api-key": "wrong-key",
      });
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      expect(result.statusCode).toBe(401);
    });

    it("permite acceso con API key correcta", async () => {
      process.env.API_KEY = "test-secret-key";

      vi.resetModules();
      const { handler } = await import("./api");

      const event = createMockEvent("/status/AAA080808HL8", "GET", {
        "x-api-key": "test-secret-key",
      });
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      expect(result.statusCode).not.toBe(401);
    });

    it("/metadata es público incluso con API_KEY configurada", async () => {
      process.env.API_KEY = "test-secret-key";

      vi.resetModules();
      const { handler } = await import("./api");

      const event = createMockEvent("/metadata", "GET");
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      expect(result.statusCode).toBe(200);
    });

    it("/health es público incluso con API_KEY configurada", async () => {
      process.env.API_KEY = "test-secret-key";

      vi.resetModules();
      const { handler } = await import("./api");

      const event = createMockEvent("/health", "GET");
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      expect(result.statusCode).toBe(200);
    });

    it("sync requiere autenticación", async () => {
      process.env.API_KEY = "test-secret-key";

      vi.resetModules();
      const { handler } = await import("./api");

      const event = createMockEvent("/sync", "POST");
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      expect(result.statusCode).toBe(401);
    });
  });

  describe("respuesta de /status (compat v1 + expedientes)", () => {
    const EMPTY_STEP = {
      oficioSat: null,
      fechaSat: null,
      oficioDof: null,
      fechaDof: null,
    };
    const expediente = (situacion: string, oficio: string): object => ({
      situacion,
      presuncion: { ...EMPTY_STEP, oficioSat: oficio },
      desvirtuado: EMPTY_STEP,
      definitivo: EMPTY_STEP,
      sentenciaFavorable: EMPTY_STEP,
    });

    async function callStatus(
      rfc: string,
      asOf?: string,
    ): Promise<{
      statusCode: number | undefined;
      body: Record<string, unknown>;
    }> {
      delete process.env.API_KEY;
      vi.resetModules();
      const { handler } = await import("./api");
      const event = {
        ...createMockEvent(`/status/${rfc}`, "GET"),
        pathParameters: { rfc },
        queryStringParameters: asOf ? { asOf } : undefined,
      } as unknown as APIGatewayProxyEventV2;
      const result = await handler(event, createMockContext(), () => {});
      return {
        statusCode: result.statusCode,
        body: JSON.parse(result.body ?? "{}") as Record<string, unknown>,
      };
    }

    it("respuesta v1 intacta + expedientes aditivo para RFC multi-expediente", async () => {
      const redis = await import("@/services/sat69bRedis");
      vi.mocked(redis.getRecordByRfc).mockResolvedValue({
        rfc: "AAS110331G59",
        nombre: "EMPRESA DOS",
        situacion: "Definitivo",
        expedientes: [
          expediente("Definitivo", "Of-2020"),
          expediente("Sentencia Favorable", "Of-2017"),
        ],
      } as never);

      const { statusCode, body } = await callStatus("AAS110331G59");
      expect(statusCode).toBe(200);
      expect(body.found).toBe(true);
      expect(body.status).toBe("Definitivo"); // el más severo
      const record = body.record as Record<string, unknown>;
      expect(record.situacion).toBe("Definitivo");
      expect(record.presuncion).toBeDefined(); // forma plana v1 conservada
      expect(body.expedientes).toHaveLength(2); // campo nuevo aditivo
    });

    it("con ?asOf devuelve verdict69b; sin él la respuesta v1 no cambia", async () => {
      const redis = await import("@/services/sat69bRedis");
      const definitivo = {
        rfc: "AAA120730823",
        nombre: "EMPRESA TRES",
        situacion: "Definitivo",
        expedientes: [
          {
            situacion: "Definitivo",
            presuncion: { ...EMPTY_STEP, fechaSat: "01/01/2020" },
            desvirtuado: EMPTY_STEP,
            definitivo: { ...EMPTY_STEP, fechaSat: "01/06/2020" },
            sentenciaFavorable: EMPTY_STEP,
          },
        ],
      };
      vi.mocked(redis.getRecordByRfc).mockResolvedValue(definitivo as never);

      const sin = await callStatus("AAA120730823");
      expect(sin.body.verdict69b).toBeUndefined();
      expect(sin.body.asOf).toBeUndefined();

      vi.mocked(
        (await import("@/services/sat69bRedis")).getRecordByRfc,
      ).mockResolvedValue(definitivo as never);
      const dentro = await callStatus("AAA120730823", "2021-01-01");
      expect(dentro.body.asOf).toBe("2021-01-01");
      const v = dentro.body.verdict69b as Record<string, unknown>;
      expect(v.vigente).toBe("Definitivo");

      vi.mocked(
        (await import("@/services/sat69bRedis")).getRecordByRfc,
      ).mockResolvedValue(definitivo as never);
      const antes = await callStatus("AAA120730823", "2019-06-01");
      const v2 = antes.body.verdict69b as Record<string, unknown>;
      expect(v2.vigente).toBeNull(); // gasto anterior a la entrada en lista
    });

    it("asOf con formato inválido → 400", async () => {
      const { statusCode } = await callStatus("AAA120730823", "01/06/2021");
      expect(statusCode).toBe(400);
    });

    it("RFC no listado con asOf → verdict limpio", async () => {
      const redis = await import("@/services/sat69bRedis");
      vi.mocked(redis.getRecordByRfc).mockResolvedValue(null as never);
      const { body } = await callStatus("OKT250101AA1", "2024-01-01");
      expect(body.found).toBe(false);
      const v = body.verdict69b as Record<string, unknown>;
      expect(v.vigente).toBeNull();
      expect(v.exculpado).toBe(false);
    });

    it("tolera un record con formato viejo (pre-deploy) almacenado en Redis", async () => {
      const redis = await import("@/services/sat69bRedis");
      // formato plano antiguo sin expedientes[]
      vi.mocked(redis.getRecordByRfc).mockResolvedValue({
        rfc: "AAA080808HL8",
        nombre: "EMPRESA UNO",
        situacion: "Presunto",
        presuncion: { ...EMPTY_STEP, oficioSat: "Of-2018" },
        desvirtuado: EMPTY_STEP,
        definitivo: EMPTY_STEP,
        sentenciaFavorable: EMPTY_STEP,
      } as never);

      const { statusCode, body } = await callStatus("AAA080808HL8");
      expect(statusCode).toBe(200);
      expect(body.found).toBe(true);
      expect(body.status).toBe("Presunto");
      expect(body.expedientes).toHaveLength(1); // envuelto como expediente único
    });
  });

  describe("scheduled events", () => {
    it("procesa eventos programados sin auth", async () => {
      process.env.API_KEY = "test-secret-key";

      vi.resetModules();
      const { handler } = await import("./api");

      const event: ScheduledEvent = {
        source: "aws.events",
        "detail-type": "Scheduled Event",
        detail: {},
      } as unknown as ScheduledEvent;
      const context = createMockContext();

      const result = await handler(event, context, () => {});
      // scheduled events van directo a sync, no deberían dar 401
      expect(result.statusCode).not.toBe(401);
    });
  });
});
