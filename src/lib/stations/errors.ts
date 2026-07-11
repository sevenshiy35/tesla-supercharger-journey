import "server-only";

export type StationRepositoryErrorCode = "configuration" | "request" | "validation";

export class StationRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: StationRepositoryErrorCode,
  ) {
    super(message);
    this.name = "StationRepositoryError";
  }
}

export class StationDataConfigurationError extends StationRepositoryError {
  constructor(message: string) {
    super(message, "configuration");
    this.name = "StationDataConfigurationError";
  }
}

export class StationDataRequestError extends StationRepositoryError {
  constructor(message: string) {
    super(message, "request");
    this.name = "StationDataRequestError";
  }
}

export class StationDataValidationError extends StationRepositoryError {
  constructor(message: string) {
    super(message, "validation");
    this.name = "StationDataValidationError";
  }
}
