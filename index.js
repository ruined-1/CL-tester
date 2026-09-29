require("dotenv").config();

const express = require("express");
const fs = require("fs");

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    Routes,
    REST,
    EmbedBuilder
} = require("discord.js");

// =====================================================
// CONFIG
// =====================================================

const TOKEN = process.env.TOKEN;
const LOG_CHANNEL_ID = "1536043209157779587";
const CLIENT_ID = "1536042818664013916";

if (!TOKEN) {
    console.error("❌ Missing TOKEN environment variable.");
    process.exit(1);
}

// =====================================================
// WEB SERVER - FOR RENDER
// =====================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot is online.");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// =====================================================
// DATABASE
// =====================================================

let db = {
    strikes: {},
    bugs: []
};

if (fs.existsSync("./db.json")) {
    try {
        db = JSON.parse(fs.readFileSync("./db.json", "utf8"));
        console.log("✅ Database loaded.");
    } catch (error) {
        console.error("❌ Failed to load db.json:", error);
        process.exit(1);
    }
}

// Save database
function saveDB() {
    try {
        fs.writeFileSync(
            "./db.json",
            JSON.stringify(db, null, 2)
        );

        console.log("💾 Database saved.");
    } catch (error) {
        console.error("❌ Failed to save database:", error);
    }
}

// =====================================================
// DUPLICATE BUG DETECTION
// =====================================================

function isDuplicate(title) {
    const normalized = title.toLowerCase();

    return db.bugs.find(
        bug =>
            normalized.includes(bug.title.toLowerCase()) ||
            bug.title.toLowerCase().includes(normalized)
    );
}

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// =====================================================
// DISCORD CONNECTION EVENTS
// =====================================================

client.once("ready", async () => {
    console.log(`✅ Discord connected as ${client.user.tag}`);
    console.log(`🤖 Bot ID: ${client.user.id}`);
    console.log(`🌐 Serving ${client.guilds.cache.size} server(s)`);

    try {
        console.log("🔄 Registering slash commands...");

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        console.log("✅ Commands registered successfully.");
    } catch (error) {
        console.error("❌ Failed to register commands:", error);
    }
});

// =====================================================
// SLASH COMMANDS
// =====================================================

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

// =====================================================
// REGISTER SLASH COMMANDS
// =====================================================

const rest = new REST({
    version: "10"
}).setToken(TOKEN);

async function registerCommands() {
    try {
        console.log("🔄 Registering slash commands...");

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        console.log("✅ Commands registered successfully.");
    } catch (error) {
        console.error("❌ Failed to register commands:", error);
    }
}

// =====================================================
// SLASH COMMAND HANDLING
// =====================================================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        // =================================================
        // STRIKE COMMAND
        // =================================================

        if (interaction.commandName === "strike") {
            const tester = interaction.options.getUser("tester");
            const reason = interaction.options.getString("reason");

            if (!db.strikes[tester.id]) {
                db.strikes[tester.id] = [];
            }

            db.strikes[tester.id].push({
                reason: reason,
                date: Date.now()
            });

            saveDB();

            await interaction.reply({
                content: `⚠️ Strike added to **${tester.username}** for: ${reason}`
            });

            return;
        }

        // =================================================
        // REPORT COMMAND
        // =================================================

        if (interaction.commandName === "report") {
            const title = interaction.options.getString("title");
            const description =
                interaction.options.getString("description");

            const duplicate = isDuplicate(title);

            const bug = {
                id: db.bugs.length + 1,
                title: title,
                description: description,
                reporter: interaction.user.id,
                date: Date.now()
            };

            db.bugs.push(bug);
            saveDB();

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(0x040024)
                .setFooter({
                    text: `Reported by ${interaction.user.username}`
                })
                .setTimestamp();

            // Find log channel
            const logChannel =
                client.channels.cache.get(LOG_CHANNEL_ID);

            if (logChannel) {
                await logChannel.send({
                    embeds: [embed]
                });
            } else {
                console.warn(
                    `⚠️ Could not find log channel ${LOG_CHANNEL_ID}`
                );
            }

            // Reply to reporter
            await interaction.reply({
                content: duplicate
                    ? `🐛 Bug reported — **duplicate detected** of: "${duplicate.title}"`
                    : "🐛 Bug reported successfully"
            });

            return;
        }
    } catch (error) {
        console.error("❌ Error handling interaction:", error);

        // Only respond if we haven't already responded
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "❌ Something went wrong while processing that command.",
                ephemeral: true
            }).catch(() => {});
        }
    }
});

// =====================================================
// START BOT
// =====================================================

async function startBot() {
    try {
        console.log("🔑 Logging into Discord...");

        await client.login(TOKEN);

        console.log("✅ Discord login successful.");
    } catch (error) {
        console.error("❌ Failed to login to Discord:", error);
        process.exit(1);
    }
}

startBot();