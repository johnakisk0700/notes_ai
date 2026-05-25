import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

export function timeLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const method = req.method;
  const path = req.path; // or req.url if you prefer the full URL (including any query params)
  const startTime = performance.now();
  res.on("finish", () => {
    const executionTime = (performance.now() - startTime) / 1000; // convert ms to seconds
    logger.info(
      `${method} ${path} responded ${res.statusCode} in ${executionTime.toFixed(3)}s`
    );
  });

  next();
}
