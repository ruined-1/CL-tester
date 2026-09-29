require("dotenv").config();

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot is online.");
});

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

client.once("ready", () => {
    console.log(`✅ Discord connected as ${client.user.tag}`);
});

client.on("error", (error) => {
    console.error("❌ Discord client error:", error);
});

client.on("shardError", (error) => {
    console.error("❌ Discord Gateway error:", error);
});

client.on("shardDisconnect", (event) => {
    console.log("⚠️ Discord disconnected:", event);
});

client.on("shardReconnecting", () => {
    console.log("🔄 Discord reconnecting...");
});

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    Routes,
    REST,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");

const TOKEN = process.env.TOKEN;
const LOG_CHANNEL_ID = "1536043209157779587";

if (!TOKEN) {
    console.error("Missing TOKEN in .env file");
    process.exit(1);
}

// Load or create database
let db = {
    strikes: {},
    bugs: []
};

if (fs.existsSync("./db.json")) {
    db = JSON.parse(fs.readFileSync("./db.json", "utf8"));
}

// Save DB helper
function saveDB() {
    fs.writeFileSync("./db.json", JSON.stringify(db, null, 2));
}

// Duplicate detection
function isDuplicate(title) {
    const normalized = title.toLowerCase();

    return db.bugs.find(
        bug =>
            normalized.includes(bug.title.toLowerCase()) ||
            bug.title.toLowerCase().includes(normalized)
    );
}

// Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Slash commands
const commands = [
    new SlashCommandBuilder()
        .setName("strike")
        .setDescription("Strike a tester for a mistake")
        .addUserOption(option =>
            option
                .setName("tester")
                .setDescription("Tester to strike")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for strike")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("report")
        .setDescription("Report a bug")
        .addStringOption(option =>
            option
                .setName("title")
                .setDescription("Bug title")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("description")
                .setDescription("Bug description")
                .setRequired(true)
        )
].map(command => command.toJSON());

// Register commands
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationCommands("1536042818664013916"),
            {
                body: commands
            }
        );

        console.log("Commands registered");
    } catch (error) {
        console.error(error);
    }
})();

// Ready event
client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Slash command handling
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // STRIKE COMMAND
    if (interaction.commandName === "strike") {
        const tester = interaction.options.getUser("tester");
        const reason = interaction.options.getString("reason");

        if (!db.strikes[tester.id]) {
            db.strikes[tester.id] = [];
        }

        db.strikes[tester.id].push({
            reason,
            date: Date.now()
        });

        saveDB();

        await interaction.reply({
            content: `⚠️ Strike added to **${tester.username}** for: ${reason}`
        });

        return;
    }

    // REPORT COMMAND
    if (interaction.commandName === "report") {
        const title = interaction.options.getString("title");
        const description = interaction.options.getString("description");

        const duplicate = isDuplicate(title);

        const bug = {
            id: db.bugs.length + 1,
            title,
            description,
            reporter: interaction.user.id,
            date: Date.now()
        };

        db.bugs.push(bug);
        saveDB();

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0x040024)
            .setFooter({
                text: `Reported by ${interaction.user.username}`
            })
            .setTimestamp();

        const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);

        if (logChannel) {
            await logChannel.send({
                embeds: [embed]
            });
        }

        await interaction.reply({
            content: duplicate
                ? `🐛 Bug reported — **duplicate detected** of: "${duplicate.title}"`
                : "🐛 Bug reported successfully"
        });
    }
});

client.login(TOKEN);