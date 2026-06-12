import type { DailyPricePoint } from "../types.js";

const CHART_BASE_URL = "https://quickchart.io/chart";
const CHART_CREATE_URL = "https://quickchart.io/chart/create";
const MAX_CHART_POINTS = 110;
const MAX_COMPACT_CHART_POINTS = 48;
const MAX_DIRECT_URL_LENGTH = 1900;
type ChartVariant = "full" | "compact";

interface PriceActionSeries {
  labels: string[];
  prices: number[];
  volumes: number[];
  volumeColors: string[];
  greenLine: Array<number | null>;
  redLine: Array<number | null>;
}

export async function buildDailyPriceChartUrl(
  ticker: string,
  points: DailyPricePoint[],
  currency: string,
  variant: ChartVariant = "full"
): Promise<string | null> {
  if (points.length < 2) {
    return null;
  }

  const isCompact = variant === "compact";
  const dimensions = isCompact ? { width: 640, height: 270 } : { width: 1200, height: 675 };
  const sampledPoints = samplePoints(points, isCompact ? MAX_COMPACT_CHART_POINTS : MAX_CHART_POINTS);
  const openingPrice = sampledPoints[0].price;

  if (openingPrice <= 0) {
    return null;
  }

  const series = buildPriceActionSeries(sampledPoints, openingPrice);
  const latestPrice = series.prices[series.prices.length - 1] ?? openingPrice;
  const latestChange = latestPrice - openingPrice;
  const latestChangePercent = (latestChange / openingPrice) * 100;
  const sessionColor =
    latestChangePercent > 0.05 ? "#25d366" : latestChangePercent < -0.05 ? "#ff4d4d" : "#a7b0bc";
  const priceBounds = getPriceAxisBounds(series.prices, openingPrice);
  const volumeMax = Math.max(...series.volumes, 1);

  const config = {
    type: "bar",
    data: {
      labels: series.labels,
      datasets: [
        {
          type: "bar",
          label: "Volume",
          data: series.volumes,
          yAxisID: "volume",
          backgroundColor: series.volumeColors,
          borderWidth: 0,
          barPercentage: 0.9,
          categoryPercentage: 1,
          order: 4
        },
        {
          type: "line",
          label: "Above open",
          data: series.greenLine,
          yAxisID: "price",
          borderColor: "#25d366",
          backgroundColor: "rgba(37, 211, 102, 0.16)",
          borderWidth: 2.5,
          pointRadius: 0,
          spanGaps: false,
          tension: 0.16,
          fill: {
            target: {
              value: openingPrice
            }
          },
          order: 1
        },
        {
          type: "line",
          label: "Below open",
          data: series.redLine,
          yAxisID: "price",
          borderColor: "#ff4d4d",
          backgroundColor: "rgba(255, 77, 77, 0.14)",
          borderWidth: 2.5,
          pointRadius: 0,
          spanGaps: false,
          tension: 0.16,
          fill: {
            target: {
              value: openingPrice
            }
          },
          order: 1
        },
        {
          type: "line",
          label: `Open ${formatCurrency(openingPrice, currency)}`,
          data: series.labels.map(() => Number(openingPrice.toFixed(4))),
          yAxisID: "price",
          borderColor: "rgba(255, 255, 255, 0.75)",
          borderDash: [7, 7],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0,
          order: 2
        },
        {
          type: "line",
          label: "Latest",
          data: series.labels.map((_, index) =>
            index === series.labels.length - 1 ? Number(latestPrice.toFixed(4)) : null
          ),
          yAxisID: "price",
          borderColor: sessionColor,
          pointBackgroundColor: sessionColor,
          pointBorderColor: sessionColor,
          pointRadius: 5,
          pointHoverRadius: 5,
          showLine: false,
          order: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 16,
          right: 28,
          bottom: 14,
          left: 20
        }
      },
      plugins: {
        legend: {
          display: false
        },
        title: {
          display: true,
          align: "start",
          color: "#f5f7fb",
          font: {
            size: isCompact ? 16 : 28,
            weight: "bold"
          },
          padding: {
            bottom: isCompact ? 2 : 4
          },
          text: isCompact
            ? `${ticker} ${formatPercent(latestChangePercent)}`
            : `${ticker}  ${formatCurrency(latestPrice, currency)}  ${formatSignedCurrency(
                latestChange,
                currency
              )} (${formatPercent(latestChangePercent)})`
        },
        subtitle: {
          display: !isCompact,
          align: "start",
          color: "#a7b0bc",
          font: {
            size: 15
          },
          padding: {
            bottom: 18
          },
          text: `Open ${formatCurrency(openingPrice, currency)}  |  High ${formatCurrency(
            Math.max(...series.prices),
            currency
          )}  |  Low ${formatCurrency(Math.min(...series.prices), currency)}  |  Volume ${formatCompactNumber(
            series.volumes.reduce((total, volume) => total + volume, 0)
          )}`
        }
      },
      scales: {
        x: {
          grid: {
            color: "rgba(148, 163, 184, 0.18)",
            borderDash: [4, 5],
            drawTicks: false
          },
          ticks: {
            color: "#f5f7fb",
            maxTicksLimit: isCompact ? 4 : 8,
            maxRotation: 0,
            autoSkip: true,
            padding: 10
          }
        },
        price: {
          position: "right",
          min: priceBounds.min,
          max: priceBounds.max,
          grid: {
            color: "rgba(148, 163, 184, 0.18)",
            borderDash: [4, 5],
            drawTicks: false
          },
          ticks: {
            color: "#f5f7fb",
            maxTicksLimit: isCompact ? 4 : 7,
            padding: 10
          }
        },
        volume: {
          position: "left",
          display: false,
          min: 0,
          max: volumeMax * (isCompact ? 6 : 4.5),
          grid: {
            display: false
          }
        }
      }
    }
  };

  const url = new URL(CHART_BASE_URL);
  url.searchParams.set("width", String(dimensions.width));
  url.searchParams.set("height", String(dimensions.height));
  url.searchParams.set("backgroundColor", "#06111a");
  url.searchParams.set("version", "4");
  url.searchParams.set("c", JSON.stringify(config));

  const directUrl = url.toString();

  if (directUrl.length <= MAX_DIRECT_URL_LENGTH) {
    return directUrl;
  }

  try {
    const response = await fetch(CHART_CREATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chart: config,
        width: dimensions.width,
        height: dimensions.height,
        backgroundColor: "#06111a",
        format: "png",
        version: "4"
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as unknown;

    if (!isRecord(data) || typeof data.url !== "string") {
      return null;
    }

    return data.url;
  } catch {
    return null;
  }
}

function buildPriceActionSeries(points: DailyPricePoint[], openingPrice: number): PriceActionSeries {
  const expandedPoints = addOpenCrossingPoints(points, openingPrice);
  const labels = expandedPoints.map((point) => formatChartTime(point.timestamp));
  const prices = expandedPoints.map((point) => point.price);
  const volumes = expandedPoints.map((point) => point.volume ?? 0);
  const volumeColors = expandedPoints.map((point, index) => {
    if (!point.volume) {
      return "rgba(0, 0, 0, 0)";
    }

    const previousPrice = expandedPoints[Math.max(0, index - 1)].price;

    return point.price >= previousPrice ? "rgba(37, 211, 102, 0.82)" : "rgba(255, 77, 77, 0.82)";
  });

  return {
    labels,
    prices,
    volumes,
    volumeColors,
    greenLine: prices.map((price) => (price >= openingPrice ? Number(price.toFixed(4)) : null)),
    redLine: prices.map((price) => (price <= openingPrice ? Number(price.toFixed(4)) : null))
  };
}

function addOpenCrossingPoints(points: DailyPricePoint[], openingPrice: number): DailyPricePoint[] {
  const expandedPoints: DailyPricePoint[] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousDelta = previous.price - openingPrice;
    const currentDelta = current.price - openingPrice;

    if (previousDelta !== 0 && currentDelta !== 0 && Math.sign(previousDelta) !== Math.sign(currentDelta)) {
      const ratio = Math.abs(previousDelta) / (Math.abs(previousDelta) + Math.abs(currentDelta));
      const timestamp =
        previous.timestamp.getTime() + (current.timestamp.getTime() - previous.timestamp.getTime()) * ratio;

      expandedPoints.push({
        timestamp: new Date(timestamp),
        price: openingPrice
      });
    }

    expandedPoints.push(current);
  }

  return expandedPoints;
}

function samplePoints(points: DailyPricePoint[], maxPoints: number): DailyPricePoint[] {
  if (points.length <= maxPoints) {
    return points;
  }

  const sampled: DailyPricePoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);

  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }

  return sampled;
}

function getPriceAxisBounds(values: number[], openingPrice: number): { min: number; max: number } {
  const minValue = Math.min(...values, openingPrice);
  const maxValue = Math.max(...values, openingPrice);
  const range = Math.max(maxValue - minValue, openingPrice * 0.006);
  const padding = range * 0.18;

  return {
    min: Number((minValue - padding).toFixed(2)),
    max: Number((maxValue + padding).toFixed(2))
  };
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

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function formatChartTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
