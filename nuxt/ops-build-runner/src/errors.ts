/** Typed, HTTP-status-carrying errors the service layer throws and the HTTP layer maps 1:1. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message)
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message)
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, message)
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(403, message)
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message)
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message: string) {
    super(503, message)
  }
}
