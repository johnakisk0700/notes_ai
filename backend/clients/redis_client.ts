import { RedisClient } from "bun";

export const redis = new RedisClient(process.env.REDIS_URL || "redis://127.0.0.1:6380", {
  autoReconnect: true,
  maxRetries: 10,
  enableOfflineQueue: true,
  idleTimeout: 0, // No idle timeout
});
