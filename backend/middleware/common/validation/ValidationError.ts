import { AppError } from "../AppError.js";

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super({
      message,
      statusCode: 400,
      details,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    super({
      message: `${resource} ${id ? `with id ${id}` : ""} not found`,
      statusCode: 404,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized access") {
    super({
      message,
      statusCode: 401,
    });
  }
}

export class DatabaseError extends AppError {
  constructor(message = "Database error") {
    super({
      message,
      statusCode: 500,
    });
  }
}
