import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) throw new Error("Missing DISCORD_TOKEN");
if (!clientId) throw new Error("Missing DISCORD_CLIENT_ID");
if (!guildId) throw new Error("Missing DISCORD_GUILD_ID");

const commands = [
  new SlashCommandBuilder()
    .setName("simon")
    .setDescription("Look up stock prices and recent news.")
    .addStringOption((option) =>
      option
        .setName("ticker")
        .setDescription("Stock ticker symbol")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("crypto")
        .setDescription("Crypto symbol, example: BTC, ETH, SOL")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("movers")
        .setDescription("Show daily gainers or losers")
        .setRequired(false)
        .addChoices(
          { name: "hot", value: "hot" },
          { name: "not", value: "not" }
        )
    )
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(token);

console.log("Deploying Simonbot slash commands...");

await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
  body: commands,
});

console.log("Simonbot slash commands deployed.");
