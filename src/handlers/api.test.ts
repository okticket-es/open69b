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
