import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIGatewayProxyEventV2, ScheduledEvent } from "aws-lambda";

vi.mock("@/services/art69Sync", () => ({
  syncArt69: vi.fn().mockResolvedValue({
    listasOk: 14,
    listasFallidas: [],
    rfcsTotal: 100,
    rfcsEscritos: 100,
    rfcsFallidos: 0,
    duration: 1000,
  }),
}));

const httpEvent = (
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2 =>
  ({
    rawPath: "/art69/sync",
    headers,
    requestContext: { http: { method: "POST" } },
  }) as unknown as APIGatewayProxyEventV2;

const scheduledEvent = (): ScheduledEvent =>
  ({
    source: "aws.events",
    "detail-type": "Scheduled Event",
    detail: {},
  }) as unknown as ScheduledEvent;

describe("art69SyncHandler — autenticación", () => {
  const originalKey = process.env.API_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.API_KEY = originalKey;
  });

  it("HTTP sin x-api-key → 401 cuando hay API_KEY configurada", async () => {
    process.env.API_KEY = "secreta";
    const { handler } = await import("@/handlers/art69SyncHandler");
    const result = await handler(httpEvent());
    expect(result.statusCode).toBe(401);
  });

  it("HTTP con x-api-key incorrecta → 401", async () => {
    process.env.API_KEY = "secreta";
    const { handler } = await import("@/handlers/art69SyncHandler");
    const result = await handler(httpEvent({ "x-api-key": "mala" }));
    expect(result.statusCode).toBe(401);
  });

  it("HTTP con x-api-key correcta → ejecuta el sync", async () => {
    process.env.API_KEY = "secreta";
    const { handler } = await import("@/handlers/art69SyncHandler");
    const result = await handler(httpEvent({ "x-api-key": "secreta" }));
    expect(result.statusCode).toBe(200);
  });

  it("el schedule diario NO necesita API key (evento de EventBridge)", async () => {
    process.env.API_KEY = "secreta";
    const { handler } = await import("@/handlers/art69SyncHandler");
    const result = await handler(scheduledEvent());
    expect(result.statusCode).toBe(200);
  });

  it("sin API_KEY configurada, HTTP queda abierto (mismo criterio que api.ts)", async () => {
    delete process.env.API_KEY;
    const { handler } = await import("@/handlers/art69SyncHandler");
    const result = await handler(httpEvent());
    expect(result.statusCode).toBe(200);
  });
});
