import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatus } from "@/utils/types";

vi.mock("@/services/sat69bRedis", () => ({
  getMetadata: vi.fn(),
  setMetadata: vi.fn(),
  clearAllRecords: vi.fn(),
  bulkSetRecords: vi.fn(),
}));

vi.mock("@/services/s3Backup", () => ({
  backupCsvToS3: vi.fn(),
}));

describe("syncFromSat — path de fallo", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserva dataCutDate en la metadata FAILED y evalúa la alarma de frescura", async () => {
    // la descarga falla siempre (URL del SAT rota — el escenario del espejo congelado)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    const redis = await import("@/services/sat69bRedis");
    // metadata previa con un corte rancio (>90 días)
    vi.mocked(redis.getMetadata).mockResolvedValue({
      lastSyncAt: "2026-01-01T00:00:00.000Z",
      rowCount: 14000,
      csvHash: "abc",
      csvSize: 1,
      syncDuration: 1,
      status: SyncStatus.SUCCESS,
      dataCutDate: "2025-12-31",
      skippedInvalidRfc: 91,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { syncFromSat } = await import("@/services/csvSync");
    const result = await syncFromSat();

    expect(result.success).toBe(false);
    const saved = vi.mocked(redis.setMetadata).mock.calls.at(-1)?.[0];
    expect(saved?.status).toBe(SyncStatus.FAILED);
    expect(saved?.dataCutDate).toBe("2025-12-31"); // no se pierde en el fallo
    // la alarma de frescura sigue sonando aunque el sync falle
    const staleLogs = errorSpy.mock.calls.filter((c) =>
      String(c[0]).includes("SAT_DATA_STALE"),
    );
    expect(staleLogs.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("no revienta si Redis tampoco responde en el path de fallo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const redis = await import("@/services/sat69bRedis");
    vi.mocked(redis.getMetadata).mockRejectedValue(new Error("redis down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { syncFromSat } = await import("@/services/csvSync");
    const result = await syncFromSat();
    expect(result.success).toBe(false);
  }, 30000);
});
