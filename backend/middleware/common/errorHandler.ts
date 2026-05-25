import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { AppError } from "./AppError.js";
import { logger } from "../../utils/logger.js"; // Ensure your logger is correctly initialized

export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // next is required by Express's ErrorRequestHandler signature
  next: NextFunction
) => {
  const isProduction = process.env.NODE_ENV === "production";

  const requestContext = {
    requestId: req.headers["x-request-id"] || "N/A",
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: (req as any).user?.id || "N/A",
  };

  // --- Determine Core Error Properties ---
  let statusCode = 500;
  const errorName = err.name || "InternalServerError";
  const actualErrorMessage = err.message || "An unexpected internal server error occurred.";
  let errorDetails: Record<string, any> | undefined;

  // The `err.stack` should include cause information if `Error` was constructed with a `cause` option (Node.js v16.9.0+)
  // or if AppError.captureStackTrace handles it.
  const loggedStack = err.stack || `${errorName}: ${actualErrorMessage}`;
  let loggedCause: { name: string; message: string; stack?: string } | undefined;

  if (err.cause instanceof Error) {
    loggedCause = {
      name: err.cause.name,
      message: err.cause.message,
      stack: err.cause.stack,
    };
  }

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorDetails = err.details;
    // AppError's message is used as actualErrorMessage
    // AppError's name is used as errorName
    // AppError's stack is used as loggedStack
    // AppError's cause is processed into loggedCause if it exists
  }

  // --- Log Payload Construction (Always Detailed) ---
  const logPayload: Record<string, any> = {
    ...requestContext,
    error: {
      name: errorName,
      message: actualErrorMessage, // Log the true error message
      statusCode: statusCode,
      stack: loggedStack, // Log the primary stack
    },
  };

  if (errorDetails) {
    logPayload.error.details = errorDetails;
  }
  if (loggedCause) {
    logPayload.error.cause = loggedCause; // Log structured cause if present
  }

  // --- Logging ---
  const logTitle = `[${errorName}] ${actualErrorMessage}`;
  if (statusCode >= 500) {
    logger.error(logPayload, logTitle);
  } else if (statusCode >= 400) {
    logger.warn(logPayload, logTitle);
  } else {
    logger.info(logPayload, logTitle); // For other cases, if any
  }

  // --- Client Response Preparation ---
  let clientMessage: string;
  if (isProduction) {
    if (err instanceof AppError && err.statusCode < 500) {
      clientMessage = err.message; // Use AppError's message for 4xx errors as it's crafted for the client
    } else {
      clientMessage = "An unexpected internal server error occurred."; // Generic for 5xx or other unhandled errors
    }
  } else {
    clientMessage = actualErrorMessage; // Full message in development
  }

  const clientErrorResponse: Record<string, any> = {
    error: {
      name: errorName,
      message: clientMessage,
      statusCode: statusCode,
      timestamp: new Date().toISOString(),
    },
  };

  if (!isProduction) {
    if (errorDetails) {
      clientErrorResponse.error.details = errorDetails;
    }
    // For client-side stack in development:
    // If AppError has getFullStack, use it as it's designed for a comprehensive string.
    // Otherwise, use the loggedStack. If it's a generic error with a cause,
    // ensure the cause's stack is represented (modern Node.js err.stack might do this if cause was in constructor).
    if (err instanceof AppError && typeof err.getFullStack === "function") {
      clientErrorResponse.error.stack = err.getFullStack();
    } else {
      let devStack = loggedStack;
      // If not AppError and cause exists, and loggedStack doesn't seem to already include cause details, append them.
      // This is a fallback; ideally, `err.stack` from `new Error(msg, { cause })` is sufficient.
      if (
        !(err instanceof AppError) &&
        loggedCause &&
        loggedCause.stack &&
        !loggedStack?.includes(loggedCause.message)
      ) {
        devStack += `\nCaused by: ${loggedCause.name}: ${loggedCause.message}\n${loggedCause.stack}`;
      }
      clientErrorResponse.error.stack = devStack;
    }
  }

  // --- Send Response ---
  if (res.headersSent) {
    logger.error(
      {
        ...requestContext,
        originalErrorName: errorName,
        originalErrorMessage: actualErrorMessage,
        warning: "Headers already sent; could not send error response to client.",
      },
      "Error Handler: Headers already sent"
    );
    return;
  }

  res.status(statusCode).json(clientErrorResponse);
};
