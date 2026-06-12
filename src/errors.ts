export type SimonbotErrorCode =
  | "INVALID_TICKER"
  | "API_FAILURE"
  | "RATE_LIMITED"
  | "EMPTY_NEWS";

export class SimonbotError extends Error {
  constructor(
    message: string,
    public readonly code: SimonbotErrorCode,
    public readonly userMessage = message
  ) {
    super(message);
    this.name = "SimonbotError";
  }
}

export class InvalidTickerError extends SimonbotError {
  constructor(ticker?: string) {
    super(
      ticker ? `Invalid ticker: ${ticker}` : "Invalid ticker",
      "INVALID_TICKER",
      "I could not recognize that ticker. Check the symbol and try again."
    );
    this.name = "InvalidTickerError";
  }
}

export class ApiFailureError extends SimonbotError {
  constructor(message = "Market data provider request failed.") {
    super(
      message,
      "API_FAILURE",
      "I could not fetch market data right now. Please try again in a minute."
    );
    this.name = "ApiFailureError";
  }
}

export class RateLimitError extends SimonbotError {
  constructor() {
    super(
      "Market data provider rate limit reached.",
      "RATE_LIMITED",
      "The market data provider is rate limiting requests. Please try again shortly."
    );
    this.name = "RateLimitError";
  }
}

export class EmptyNewsError extends SimonbotError {
  constructor(ticker: string) {
    super(
      `No current-week news found for ${ticker}.`,
      "EMPTY_NEWS",
      `No current-week news was found for ${ticker}.`
    );
    this.name = "EmptyNewsError";
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof SimonbotError) {
    return error.userMessage;
  }

  if (error instanceof Error && error.message.startsWith("Missing required environment variable")) {
    return "Simonbot is missing required configuration. Please check the bot environment variables.";
  }

  return "Something went wrong while handling that request. Please try again in a minute.";
}
