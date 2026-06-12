import { InvalidTickerError } from "../errors.js";

const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,31}$/;

export function resolveTicker(input: string | null | undefined): string {
  const ticker = input?.trim().replace(/^\$/, "").toUpperCase();

  if (!ticker || !TICKER_PATTERN.test(ticker)) {
    throw new InvalidTickerError(input ?? undefined);
  }

  return ticker;
}
