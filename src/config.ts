import "dotenv/config";

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getDiscordRuntimeConfig() {
  return {
    token: getRequiredEnv("DISCORD_TOKEN")
  };
}

export function getDiscordRegistrationConfig() {
  return {
    token: getRequiredEnv("DISCORD_TOKEN"),
    clientId: getRequiredEnv("DISCORD_CLIENT_ID"),
    guildId: getRequiredEnv("DISCORD_GUILD_ID")
  };
}

export function getMarketDataApiKey(): string {
  return getRequiredEnv("MARKET_DATA_API_KEY");
}
