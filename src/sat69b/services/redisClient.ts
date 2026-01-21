/**
 * Cliente Redis singleton con connection pooling para Lambda.
 *
 * Usa ioredis con keep-alive para reutilizar conexiones entre invocaciones
 * de Lambda (mientras el container esté caliente).
 */

import Redis from "ioredis";

let redisClient: Redis | null = null;

/**
 * Obtiene o crea el cliente Redis singleton.
 * Reutiliza la conexión existente si el container Lambda está caliente.
 */
export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const host = process.env.REDIS_HOST || "localhost";
  const port = parseInt(process.env.REDIS_PORT || "6379", 10);

  redisClient = new Redis({
    host,
    port,
    // configuración optimizada para Lambda
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number): number | null => {
      if (times > 3) return null;
      return Math.min(times * 100, 500);
    },
    // keep-alive para reutilizar conexiones
    keepAlive: 10000,
    connectTimeout: 5000,
    // sin reconexión automática agresiva (Lambda se encarga)
    enableOfflineQueue: true,
    lazyConnect: true,
  });

  redisClient.on("error", (err) => {
    console.error("Redis connection error:", err.message);
  });

  redisClient.on("connect", () => {
    console.info("Redis connected");
  });

  return redisClient;
}

/**
 * Cierra la conexión Redis (útil para cleanup).
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
