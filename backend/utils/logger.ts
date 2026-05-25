import pino from "pino";
import cluster from "node:cluster";

export const logger = pino({
  level: "info", // Set default log level
  // Optionally use pino-pretty for readable output in development
  transport: {
    target: "pino-pretty",
    options: {
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname", // Omit unnecessary fields
      // singleLine: true,
    },
  },

  msgPrefix: `[W-${cluster.isWorker ? cluster.worker?.id : "Primary"}] `,
});

const timers: Map<string, number> = new Map();

// Override console.time with the same API
console.time = (label: string = "default"): void => {
  timers.set(label, Date.now());
  logger.debug(`Timer started for '${label}'`);
};

// Override console.timeEnd with the same API
console.timeEnd = (label: string = "default"): void => {
  const startTime = timers.get(label);
  if (startTime === undefined) {
    logger.warn(`No timer found for '${label}'`);
    return;
  }
  const elapsed = Date.now() - startTime;
  logger.info(`Timer ended for '${label}': ${elapsed}ms`);
  timers.delete(label);
};
