import { EmbedBuilder } from "discord.js";
import { toUserMessage } from "../errors.js";
import type { MarketMover, MarketMoverKind, NewsArticle, StockQuote, TickerOverview } from "../types.js";
import { formatMarketDateTime } from "./tradingWeek.js";

const FOOTER_TEXT = "Simonbot \u2022 Market data may be delayed \u2022 Not financial advice";
const GREEN = 0x2ecc71;
const RED = 0xe74c3c;
const GRAY = 0x95a5a6;
const BLURPLE = 0x5865f2;

export function buildHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BLURPLE)
    .setTitle("Simonbot")
    .setDescription("Stock summaries and current-week market news.")
    .addFields(
      {
        name: "/simon",
        value: "Show Simonbot commands."
      },
      {
        name: "/simon ticker:SYMBOL",
        value: "Show a stock summary and up to 4 recent articles."
      },
      {
        name: "/simon movers:hot",
        value: "Show the top 5 daily gainers from Simonbot's mover scan."
      },
      {
        name: "/simon movers:not",
        value: "Show the top 5 daily losers from Simonbot's mover scan."
      }
    )
    .setFooter({ text: FOOTER_TEXT });
}

export function buildStockSummaryEmbed(
  quote: StockQuote,
  overview: TickerOverview,
  chartUrl?: string | null,
  commandTime = new Date()
): EmbedBuilder {
  const move = getMoveStyle(quote.changePercent);
  const currency = overview.currency ?? "USD";

  const embed = new EmbedBuilder()
    .setColor(move.color)
    .setTitle(`${move.icon} ${overview.name} (${quote.symbol})`)
    .addFields(
      {
        name: "Price",
        value: formatCurrency(quote.price, currency),
        inline: true
      },
      {
        name: "Daily change",
        value: formatSignedCurrency(quote.change, currency),
        inline: true
      },
      {
        name: "Daily percent",
        value: formatPercent(quote.changePercent),
        inline: true
      },
      {
        name: "Previous close",
        value: formatCurrency(quote.previousClose, currency),
        inline: true
      }
    )
    .setFooter({ text: buildFooterText(commandTime) });

  if (overview.logo && isHttpUrl(overview.logo)) {
    embed.setThumbnail(overview.logo);
  }

  if (chartUrl) {
    embed.setImage(chartUrl);
  }

  return embed;
}

export function buildNewsEmbeds(articles: NewsArticle[]): EmbedBuilder[] {
  return articles.map((article) => {
    const embed = new EmbedBuilder()
      .setColor(GRAY)
      .setTitle(truncate(article.title, 256))
      .setURL(article.url)
      .addFields(
        {
          name: "Publisher",
          value: truncate(article.publisher, 100),
          inline: true
        },
        {
          name: "Published",
          value: formatPublishedDate(article.publishedAt),
          inline: true
        }
      );

    if (article.summary) {
      embed.setDescription(truncate(article.summary, 220));
    }

    if (article.imageUrl && isHttpUrl(article.imageUrl)) {
      embed.setThumbnail(article.imageUrl);
    }

    return embed;
  });
}

export function buildNoNewsEmbed(ticker: string, commandTime = new Date()): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(GRAY)
    .setTitle(`No current-week news found for ${ticker}`)
    .setDescription("The quote is available, but no recent articles were returned for this trading week.")
    .setFooter({ text: buildFooterText(commandTime) });
}

export function buildMarketMoversEmbeds(
  kind: MarketMoverKind,
  movers: MarketMover[],
  commandTime = new Date()
): EmbedBuilder[] {
  const isHot = kind === "hot";
  const color = isHot ? GREEN : RED;
  const title = isHot ? "Hot Stocks" : "Not Stocks";
  const description = isHot
    ? "Top 5 daily gainers from Simonbot's mover scan."
    : "Top 5 daily losers from Simonbot's mover scan.";

  const header = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: buildFooterText(commandTime) });

  const moverEmbeds = movers.map((mover, index) => {
    const currency = mover.currency ?? "USD";
    const move = `${formatPercent(mover.changePercent)} (${formatSignedCurrency(mover.change, currency)})`;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`#${index + 1} ${mover.symbol} - ${truncate(mover.name, 80)}`)
      .addFields(
        {
          name: "Price",
          value: formatCurrency(mover.price, currency),
          inline: true
        },
        {
          name: "Move",
          value: move,
          inline: true
        }
      );

    if (mover.logo && isHttpUrl(mover.logo)) {
      embed.setThumbnail(mover.logo);
    }

    if (mover.chartUrl) {
      embed.setImage(mover.chartUrl);
    }

    return embed;
  });

  return [header, ...moverEmbeds];
}

export function buildErrorEmbed(error: unknown): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(RED)
    .setTitle("Simonbot could not complete that lookup")
    .setDescription(toUserMessage(error));
}

function getMoveStyle(changePercent: number): { color: number; icon: string } {
  if (changePercent > 0.05) {
    return { color: GREEN, icon: "\u25B2" };
  }

  if (changePercent < -0.05) {
    return { color: RED, icon: "\u25BC" };
  }

  return { color: GRAY, icon: "\u25AC" };
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 100 ? 2 : 4
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatSignedCurrency(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";

  return `${sign}${formatCurrency(value, currency)}`;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";

  return `${sign}${value.toFixed(2)}%`;
}

function formatPublishedDate(date: Date): string {
  return formatMarketDateTime(date);
}

function buildFooterText(date: Date): string {
  return `${FOOTER_TEXT} • ${formatMarketDateTime(date)}`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
