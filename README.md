# Simonbot

Simonbot is a TypeScript Discord slash-command bot for stock and crypto lookups.

It can show stock quotes, stock news, market movers, crypto prices, rolling 24-hour crypto charts, and recent crypto news.

## Features

- `/simon` shows the help menu.
- `/simon ticker:AAPL` shows a stock summary, daily price-action chart, and up to 4 recent stock news articles.
- `/simon crypto:BTC` shows a crypto price summary, rolling 24-hour chart, coin image, and up to 4 recent crypto news articles.
- `/simon movers:hot` shows the top daily gainers from Simonbot's mover scan.
- `/simon movers:not` shows the top daily losers from Simonbot's mover scan.

## Requirements

- Node.js 20 or newer
- A Discord account and server where you can add apps
- A Finnhub API key for stocks, movers, and news
- Optional: a CoinGecko Demo API key for crypto lookups

## 1. Create A Discord App

1. Go to the Discord Developer Portal: https://discord.com/developers/applications
2. Click **New Application**.
3. Name it `Simonbot` or whatever you want.
4. Open the app, then go to **Bot**.
5. Click **Add Bot** if one does not already exist.
6. Under **Token**, click **Reset Token** or **View Token**, then copy it.
7. Keep this token private. Do not commit it to GitHub.

You do not need privileged gateway intents for this MVP because Simonbot only uses slash commands.

## 2. Invite The Bot To Your Server

1. In the Discord Developer Portal, open your app.
2. Go to **OAuth2** -> **URL Generator**.
3. Under **Scopes**, select:
   - `bot`
   - `applications.commands`
4. Under **Bot Permissions**, select:
   - `Send Messages`
   - `Embed Links`
   - `Attach Files`
5. Copy the generated URL.
6. Open the URL in your browser and invite the bot to your Discord server.

## 3. Get Your Discord IDs

You need the application client ID and the server guild ID.

For `DISCORD_CLIENT_ID`:

1. Open your app in the Discord Developer Portal.
2. Go to **General Information**.
3. Copy **Application ID**.

For `DISCORD_GUILD_ID`:

1. In Discord, go to **User Settings** -> **Advanced**.
2. Enable **Developer Mode**.
3. Right-click your Discord server icon.
4. Click **Copy Server ID**.

## 4. Get API Keys

Finnhub is required:

1. Create a Finnhub account: https://finnhub.io
2. Copy your API key.
3. Use it as `MARKET_DATA_API_KEY`.

CoinGecko is optional:

1. Create a CoinGecko Demo API key: https://www.coingecko.com/en/api
2. Use it as `COINGECKO_API_KEY`.

If `COINGECKO_API_KEY` is blank, Simonbot still attempts CoinGecko public API requests.

## 5. Install Simonbot

Clone the repo and install dependencies:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
npm install
```

On Windows PowerShell, if `npm` is blocked by execution policy, use `npm.cmd`:

```powershell
npm.cmd install
```

## 6. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill in `.env`:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id
DISCORD_GUILD_ID=your_discord_server_id
MARKET_DATA_API_KEY=your_finnhub_api_key
COINGECKO_API_KEY=your_optional_coingecko_api_key
#MARKET_MOVER_SYMBOLS=AAPL,MSFT,NVDA,TSLA,AVGO
```

`MARKET_MOVER_SYMBOLS` is optional. If you leave it commented out, Simonbot uses its default mover scan list.

Never commit `.env`. The repo is configured to ignore `.env` and `.env.*` files.

## 7. Register Slash Commands

Simonbot registers slash commands to one Discord server using `DISCORD_GUILD_ID`. Guild commands usually appear quickly.

```bash
npm run deploy
```

On Windows PowerShell:

```powershell
npm.cmd run deploy
```

You should see:

```text
Deploying Simonbot slash commands...
Simonbot slash commands deployed.
```

## 8. Run The Bot

For local development:

```bash
npm run dev
```

On Windows PowerShell:

```powershell
npm.cmd run dev
```

You should see:

```text
Starting Simonbot...
Simonbot signed in as ...
```

In Discord, try:

```text
/simon
/simon ticker:AAPL
/simon ticker:AVGO
/simon crypto:BTC
/simon movers:hot
/simon movers:not
```

## Production Build

Build TypeScript:

```bash
npm run build
```

Run the compiled bot:

```bash
npm start
```

On Windows PowerShell:

```powershell
npm.cmd run build
npm.cmd start
```

## Troubleshooting

If Discord says **Application did not respond**:

- Make sure the bot process is running.
- Make sure `DISCORD_TOKEN` is correct.
- Run `npm run deploy` again after command option changes.
- Check the terminal for API errors or missing environment variables.
- Use `npm.cmd` instead of `npm` on Windows PowerShell if script execution is blocked.

If `/simon` does not appear:

- Make sure the bot was invited with `applications.commands`.
- Make sure `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` are correct.
- Run the deploy command again.

If stock data fails:

- Check `MARKET_DATA_API_KEY`.
- Confirm your Finnhub plan has access to the requested endpoint.
- Wait briefly if you hit rate limits.

If crypto data fails:

- Try a major symbol like `BTC` or `ETH`.
- Add `COINGECKO_API_KEY` if public CoinGecko requests are rate limited.
- Wait briefly if CoinGecko rate limits requests.

## Security Notes

- Do not publish `.env`.
- Rotate your Discord bot token immediately if it is ever posted publicly.
- Prefer a GitHub noreply email before publishing commits if you do not want your personal email visible.
- Keep API keys out of screenshots, logs, issues, and commits.

## Data Sources

- Stock quotes, company profiles, stock news, and market news: Finnhub
- Crypto prices, coin metadata, and 24-hour crypto chart data: CoinGecko
- Static chart rendering: QuickChart

Market data may be delayed. Simonbot is not financial advice.
