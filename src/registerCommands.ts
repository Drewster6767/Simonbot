import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { getDiscordRegistrationConfig } from "./config.js";

const { token, clientId, guildId } = getDiscordRegistrationConfig();

const commands = [
  new SlashCommandBuilder()
    .setName("simon")
    .setDescription("Look up a stock quote and recent news.")
    .addStringOption((option) =>
      option
        .setName("ticker")
        .setDescription("Stock ticker symbol.")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("movers")
        .setDescription("Show daily gainers or losers.")
        .setRequired(false)
        .addChoices(
          { name: "hot", value: "hot" },
          { name: "not", value: "not" }
        )
    )
    .toJSON()
];

const rest = new REST({ version: "10" }).setToken(token);

try {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands
  });

  console.log("Registered Simonbot slash commands.");
} catch (error) {
  console.error("Failed to register Simonbot slash commands:", error);
  process.exitCode = 1;
}
