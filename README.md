# Simonbot

Simonbot is a TypeScript Discord slash command bot for stock quote lookups and current-week news.

## Setup

1. Install Node.js 20 or newer.
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` and fill in your Discord bot credentials plus a Finnhub API token as `MARKET_DATA_API_KEY`. `COINGECKO_API_KEY` is optional for crypto lookups.
4. Register the guild slash command:

```bash
npm run deploy
```

5. Start the bot:

```bash
npm run dev
```

## Commands

- `/simon` shows help.
- `/simon ticker:SYMBOL` shows a stock summary, daily price-action chart vs open, and up to 4 recent news articles from the current trading week.
- `/simon crypto:BTC` shows a cryptocurrency price and rolling 24-hour change.
- `/simon movers:hot` shows the top 5 daily gainers from Simonbot's mover scan.
- `/simon movers:not` shows the top 5 daily losers from Simonbot's mover scan.

## Notes

- Quote cache: 60 seconds.
- Ticker overview cache: 24 hours.
- News cache: 15 minutes.
- Market data is fetched from Finnhub endpoints.
- `MARKET_MOVER_SYMBOLS` can optionally override the default mover scan symbols with a comma-separated list.
- Discord embeds show a static daily price-action chart with time on the x-axis, price on the right y-axis, volume bars along the bottom, and a dashed opening-price baseline.
