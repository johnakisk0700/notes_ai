// Mongo connection for chat-thread persistence. Connects in the background with
// retry and lets the driver auto-reconnect on drops — see connectToDatabase below.
import type { ConnectOptions } from "mongoose";
import mongoose from "mongoose";
import { logger } from "utils/logger";

// Connection options
const options: ConnectOptions = {
  autoIndex: true, // Build indexes
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Give up server selection after 5s (then we retry)
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  // Fail operations immediately when not connected, instead of queuing them for
  // bufferTimeoutMS (default 10s) and only then erroring. Thread persistence is
  // best-effort, so a down Mongo must surface instantly — writes no-op and reads
  // degrade to empty (services/chat-threads.ts) rather than stalling every request
  // for 10s. That 10s buffer was what made the chat and sidebar "randomly slow".
  bufferCommands: false,
};

let started = false;

/**
 * Open the Mongo connection in the background, retrying with backoff until it
 * succeeds. Returns immediately so the API serves whether or not Mongo is up
 * (persistence is best-effort). Once the initial connect lands, the driver
 * auto-reconnects on transient drops, so we only retry the *initial* connect — the
 * case (Mongo not ready at boot, or a worker restart racing a Mongo restart) that
 * previously left a worker buffering/erroring on every request until the whole stack
 * was recreated, because connect was one-shot and never retried.
 */
export function connectToDatabase(): void {
  if (started) return;
  started = true;

  mongoose.connection.on("error", error => logger.error("MongoDB connection error:", error));
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));

  void connectWithRetry();
}

async function connectWithRetry(): Promise<void> {
  let delayMs = 1000;
  const maxDelayMs = 30000;
  for (;;) {
    try {
      await mongoose.connect(process.env.MONGODB_URI!, options);
      logger.info("MongoDB connected.");
      return;
    } catch (error) {
      logger.error(`MongoDB connect failed; retrying in ${Math.round(delayMs / 1000)}s:`, error);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
}
