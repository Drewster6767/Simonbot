import "dotenv/config";
import { ChatInputCommandInteraction, Client, Events, GatewayIntentBits } from "discord.js";
import { getDiscordRuntimeConfig } from "./config.js";
import { getDailyPricePoints, getQuote, getTickerOverview } from "./services/marketDataService.js";
import { getMarketMovers } from "./services/marketMoversService.js";
import { getRecentNews } from "./services/newsService.js";
import { resolveTicker } from "./services/tickerResolver.js";
import { buildDailyPriceChartUrl } from "./services/chartService.js";
import {
  buildErrorEmbed,
  buildHelpEmbed,
  buildMarketMoversEmbeds,
  buildNewsEmbeds,
  buildNoNewsEmbed,
  buildStockSummaryEmbed
} from "./services/embedBuilders.js";
import type { MarketMoverKind } from "./types.js";

const { token } = getDiscordRuntimeConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Simonbot signed in as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "simon") {
    return;
  }

  await handleSimonCommand(interaction);
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

console.log("Starting Simonbot...");

async function handleSimonCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const commandTime = new Date();
  const tickerInput = interaction.options.getString("ticker", false);
  const moversInput = interaction.options.getString("movers", false);

  const tickerShortcut = tickerInput?.trim().toLowerCase();
  const moversKind = parseMoversKind(moversInput ?? tickerShortcut);

  if (moversKind) {
    await handleMoversCommand(interaction, moversKind, commandTime);
    return;
  }

  if (!tickerInput) {
    await interaction.reply({
      embeds: [buildHelpEmbed()]
    });
    return;
  }

  let ticker: string;

  try {
    ticker = resolveTicker(tickerInput);
  } catch (error) {
    await interaction.reply({
      embeds: [buildErrorEmbed(error)]
    });
    return;
  }

  await interaction.deferReply();

  try {
    const quote = await getQuote(ticker);
    const [overview, articles, pricePoints] = await Promise.all([
      getTickerOverview(ticker).catch(() => ({
        symbol: ticker,
        name: ticker,
        currency: "USD"
      })),
      getRecentNews(ticker),
      getDailyPricePoints(ticker, commandTime).catch(() => [])
    ]);

    const chartUrl = await buildDailyPriceChartUrl(
      ticker,
      pricePoints,
      overview.currency ?? "USD"
    );
    const newsEmbeds = buildNewsEmbeds(articles);
    const embeds = [
      buildStockSummaryEmbed(quote, overview, chartUrl, commandTime),
      ...(newsEmbeds.length > 0 ? newsEmbeds : [buildNoNewsEmbed(ticker, commandTime)])
    ];

    await interaction.editReply({
      embeds
    });
  } catch (error) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(error)]
    });
  }
}

async function handleMoversCommand(
  interaction: ChatInputCommandInteraction,
  kind: MarketMoverKind,
  commandTime: Date
): Promise<void> {
  await interaction.deferReply();

  try {
    const movers = await getMarketMovers(kind, commandTime);

    await interaction.editReply({
      embeds: buildMarketMoversEmbeds(kind, movers, commandTime)
    });
  } catch (error) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(error)]
    });
  }
}

function parseMoversKind(value: string | null | undefined): MarketMoverKind | null {
  if (value === "hot" || value === "not") {
    return value;
  }

  return null;
}

client.login(token).catch((error) => {
  console.error("Failed to sign in Simonbot:", error);
  process.exitCode = 1;
});
