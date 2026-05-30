import { ValidationError } from "./ValidationError.js";

export function validateRequestBody(body, requiredFields) {
  const missingFields = requiredFields.filter(field => !body[field]);

  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(", ")}`);
  }
}
