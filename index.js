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
const CLIENT_ID = "1536042818664013916";
const LOG_CHANNEL_ID = "1536043209157779587";

if (!TOKEN) {
    console.error("❌ Missing TOKEN environment variable.");
    process.exit(1);
}

// =====================================================
// WEB SERVER - RENDER
// =====================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.status(200).send("Bot is online.");
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
        db = JSON.parse(
            fs.readFileSync("./db.json", "utf8")
        );

        console.log("✅ Database loaded.");
    } catch (error) {
        console.error("❌ Failed to load db.json:", error);
        process.exit(1);
    }
}

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
        GatewayIntentBits.Guilds
    ]
});

// =====================================================
// DISCORD DEBUG / ERROR EVENTS
// =====================================================

client.on("warn", info => {
    console.warn(`⚠️ Discord warning: ${info}`);
});

client.on("error", error => {
    console.error("❌ Discord client error:", error);
});

client.on("shardError", error => {
    console.error("❌ Discord Gateway error:", error);
});

client.on("shardDisconnect", (event, shardId) => {
    console.error(
        `⚠️ Shard ${shardId} disconnected:`,
        event
    );
});

client.on("shardReconnecting", shardId => {
    console.log(
        `🔄 Shard ${shardId} reconnecting...`
    );
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
// DISCORD REST API
// =====================================================

const rest = new REST({
    version: "10"
}).setToken(TOKEN);

// =====================================================
// READY EVENT
// =====================================================

client.once("ready", async () => {
    console.log("");
    console.log("========================================");
    console.log(
        `✅ Discord connected as ${client.user.tag}`
    );
    console.log(`🤖 Bot ID: ${client.user.id}`);
    console.log(
        `🌐 Serving ${client.guilds.cache.size} server(s)`
    );
    console.log("========================================");
    console.log("");

    // Register slash commands AFTER Discord connection
    try {
        console.log("🔄 Registering slash commands...");

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        console.log("✅ Slash commands registered successfully.");
    } catch (error) {
        console.error(
            "❌ Failed to register slash commands:"
        );

        console.error(error);
    }
});

// =====================================================
// SLASH COMMAND HANDLING
// =====================================================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) {
        return;
    }

    try {

        // =================================================
        // STRIKE COMMAND
        // =================================================

        if (interaction.commandName === "strike") {
            const tester =
                interaction.options.getUser("tester");

            const reason =
                interaction.options.getString("reason");

            if (!db.strikes[tester.id]) {
                db.strikes[tester.id] = [];
            }

            db.strikes[tester.id].push({
                reason: reason,
                date: Date.now()
            });

            saveDB();

            await interaction.reply({
                content:
                    `⚠️ Strike added to **${tester.username}** for: ${reason}`
            });

            return;
        }

        // =================================================
        // REPORT COMMAND
        // =================================================

        if (interaction.commandName === "report") {
            const title =
                interaction.options.getString("title");

            const description =
                interaction.options.getString("description");

            // Check for duplicate
            const duplicate = isDuplicate(title);

            // Create bug
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
                    text:
                        `Reported by ${interaction.user.username}`
                })
                .setTimestamp();

            // Find log channel
            const logChannel =
                client.channels.cache.get(LOG_CHANNEL_ID);

            if (logChannel) {
                await logChannel.send({
                    embeds: [embed]
                });

                console.log(
                    `📋 Bug report logged: ${title}`
                );
            } else {
                console.warn(
                    `⚠️ Could not find log channel: ${LOG_CHANNEL_ID}`
                );
            }

            // Respond to user
            await interaction.reply({
                content: duplicate
                    ? `🐛 Bug reported — **duplicate detected** of: "${duplicate.title}"`
                    : "🐛 Bug reported successfully"
            });

            return;
        }

    } catch (error) {
        console.error(
            "❌ Error while handling interaction:",
            error
        );

        if (
            !interaction.replied &&
            !interaction.deferred
        ) {
            await interaction.reply({
                content:
                    "❌ Something went wrong while processing that command.",
                ephemeral: true
            }).catch(() => {});
        }
    }
});

// =====================================================
// START DISCORD BOT
// =====================================================

async function startBot() {
    try {
        console.log("");
        console.log("🔎 Testing Discord API connection...");

        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 10000);

        const response = await fetch(
            "https://discord.com/api/v10/gateway/bot",
            {
                headers: {
                    Authorization: `Bot ${TOKEN}`,
                    "User-Agent": "CL-Quality-Control-Bot/1.0"
                },
                signal: controller.signal
            }
        );

        clearTimeout(timeout);

        console.log(`📡 Discord API status: ${response.status}`);
        console.log(`📡 Discord API content-type: ${response.headers.get("content-type")}`);

        const body = await response.text();

        console.log("");
        console.log("📄 Discord API response:");
        console.log(body.substring(0, 1000));
        console.log("");

        if (!response.ok) {
            console.error("❌ Discord API request failed.");
            process.exit(1);
        }

        let data;

        try {
            data = JSON.parse(body);
        } catch (error) {
            console.error("❌ Discord returned non-JSON data.");
            console.error("This means the request is not reaching the normal Discord API response.");
            process.exit(1);
        }

        console.log("✅ Discord API is reachable.");
        console.log(`🌐 Gateway URL: ${data.url}`);
        console.log(`🔢 Recommended shards: ${data.shards}`);

        console.log("");
        console.log("🔑 Now connecting to Discord Gateway...");
        console.log("");

        const loginTimeout = setTimeout(() => {
            console.error("");
            console.error("❌ Discord Gateway connection timed out.");
            console.error("The HTTP API responded, but the Gateway connection did not complete.");
            console.error("");
            process.exit(1);
        }, 30000);

        await client.login(TOKEN);

        clearTimeout(loginTimeout);

        console.log("");
        console.log("✅ client.login() completed.");
        console.log("");

    } catch (error) {
        console.error("");
        console.error("❌ Discord connection failed:");
        console.error(error);
        console.error("");
        process.exit(1);
    }
}

// =====================================================
// START
// =====================================================

startBot();