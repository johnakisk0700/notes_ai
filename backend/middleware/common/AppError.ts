// Base error interface for consistent error structure
interface AppErrorOptions {
  message: string;
  statusCode?: number;
  details?: Record<string, any>;
  cause?: Error; // Add cause for better error chaining
}

// Base application error class
export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: Record<string, any>;
  readonly timestamp: string;
  readonly cause?: Error;

  constructor(options: AppErrorOptions) {
    // Pass the cause to the Error constructor for better stack traces
    super(options.message, { cause: options.cause });

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.statusCode = options.statusCode || 500;
    this.details = options.details;
    this.timestamp = new Date().toISOString();
    this.cause = options.cause;

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        statusCode: this.statusCode,
        timestamp: this.timestamp,
        details: this.details,
        // Don't include cause in JSON to avoid potential circular references
      },
    };
  }

  // Add a method to get full error chain for debugging
  getFullStack(): string {
    let stack = this.stack || `${this.name}: ${this.message}`;

    if (this.cause instanceof Error) {
      stack +=
        "\nCaused by: " +
        (this.cause.stack || `${this.cause.name}: ${this.cause.message}`);
    }

    return stack;
  }
}
