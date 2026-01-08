export class BaseError extends Error {
  constructor(message, isOperational) {
    super(message);

    this.message = message;
    this.isOperational = isOperational;

    Error.captureStackTrace(this);
  }
}
