require("dotenv").config();

const express = require("express");
const fs = require("fs");
const WebSocket = require("ws");

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.TOKEN;

const CLIENT_ID = "1536042818664013916";
const LOG_CHANNEL_ID = "1536043209157779587";

const PORT = process.env.PORT || 10000;

if (!TOKEN) {
    console.error("❌ TOKEN environment variable is missing.");
    process.exit(1);
}

// ============================================================
// EXPRESS WEB SERVER
// ============================================================

const app = express();

app.get("/", (req, res) => {
    res.status(200).send("CL - Quality Control is running.");
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "online",
        discord: client.isReady() ? "connected" : "connecting"
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// ============================================================
// DATABASE
// ============================================================

const DB_FILE = "./db.json";

let db = {
    strikes: [],
    reports: []
};

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, "utf8");

            if (raw.trim()) {
                const parsed = JSON.parse(raw);

                db = {
                    strikes: Array.isArray(parsed.strikes)
                        ? parsed.strikes
                        : [],

                    reports: Array.isArray(parsed.reports)
                        ? parsed.reports
                        : []
                };
            }
        }

        console.log(
            `📁 Database loaded: ${db.strikes.length} strikes, ${db.reports.length} reports`
        );
    } catch (error) {
        console.error("❌ Failed to load db.json:");
        console.error(error);

        db = {
            strikes: [],
            reports: []
        };
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2),
            "utf8"
        );

        console.log("💾 Database saved.");
    } catch (error) {
        console.error("❌ Failed to save db.json:");
        console.error(error);
    }
}

function isDuplicateReport(title) {
    if (!title) return false;

    const normalizedTitle = title
        .trim()
        .toLowerCase();

    return db.reports.some(report => {
        return (
            typeof report.title === "string" &&
            report.title.trim().toLowerCase() === normalizedTitle
        );
    });
}

loadDatabase();

// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [
    new SlashCommandBuilder()
        .setName("strike")
        .setDescription("Give a user a quality-control strike.")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user receiving the strike.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the strike.")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("report")
        .setDescription("Submit a quality-control report.")
        .addStringOption(option =>
            option
                .setName("title")
                .setDescription("Title of the report.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("description")
                .setDescription("Description of the report.")
                .setRequired(true)
        )
].map(command => command.toJSON());

// ============================================================
// DISCORD EVENTS
// ============================================================

client.once("ready", async () => {
    console.log("");
    console.log("==========================================");
    console.log(`🤖 Discord READY: ${client.user.tag}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(`🏠 Servers: ${client.guilds.cache.size}`);
    console.log("==========================================");
    console.log("");

    // Register commands AFTER the Gateway is ready
    try {
        console.log("🔄 Registering slash commands...");

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        console.log("✅ Slash commands registered successfully.");
    } catch (error) {
        console.error("❌ Failed to register slash commands:");
        console.error(error);
    }
});

client.on("error", error => {
    console.error("❌ Discord client error:");
    console.error(error);
});

client.on("warn", warning => {
    console.warn("⚠️ Discord warning:");
    console.warn(warning);
});

client.on("shardReady", shardId => {
    console.log(`🟢 Discord shard ${shardId} is ready.`);
});

client.on("shardError", (error, shardId) => {
    console.error(`❌ Discord shard ${shardId} error:`);
    console.error(error);
});

client.on("shardDisconnect", (event, shardId) => {
    console.warn(`🔴 Discord shard ${shardId} disconnected.`);
    console.warn(event);
});

client.on("shardReconnecting", shardId => {
    console.log(`🔄 Discord shard ${shardId} reconnecting...`);
});

// ============================================================
// INTERACTION HANDLER
// ============================================================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {

        // ====================================================
        // /STRIKE
        // ====================================================

        if (interaction.commandName === "strike") {

            const user =
                interaction.options.getUser("user");

            const reason =
                interaction.options.getString("reason");

            const strike = {
                id: Date.now().toString(),
                userId: user.id,
                username: user.tag,
                reason: reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                createdAt: new Date().toISOString()
            };

            db.strikes.push(strike);

            saveDatabase();

            const embed = new EmbedBuilder()
                .setTitle("⚠️ Quality Control Strike")
                .setDescription(
                    `A strike has been issued to ${user}.`
                )
                .addFields(
                    {
                        name: "User",
                        value:
                            `${user.tag}\n\`${user.id}\``,
                        inline: true
                    },
                    {
                        name: "Moderator",
                        value:
                            interaction.user.tag,
                        inline: true
                    },
                    {
                        name: "Reason",
                        value: reason
                    }
                )
                .setTimestamp();

            await interaction.reply({
                embeds: [embed]
            });

            // Send to log channel
            try {
                const logChannel =
                    await client.channels.fetch(
                        LOG_CHANNEL_ID
                    );

                if (logChannel) {
                    await logChannel.send({
                        embeds: [embed]
                    });
                }
            } catch (error) {
                console.error(
                    "❌ Could not send strike log:"
                );

                console.error(error);
            }

            return;
        }

        // ====================================================
        // /REPORT
        // ====================================================

        if (interaction.commandName === "report") {

            const title =
                interaction.options.getString("title");

            const description =
                interaction.options.getString("description");

            // Check duplicate reports
            if (isDuplicateReport(title)) {

                await interaction.reply({
                    content:
                        "❌ A report with that title already exists.",
                    ephemeral: true
                });

                return;
            }

            const report = {
                id: Date.now().toString(),
                title: title,
                description: description,
                reporterId: interaction.user.id,
                reporterTag: interaction.user.tag,
                createdAt: new Date().toISOString()
            };

            db.reports.push(report);

            saveDatabase();

            const embed = new EmbedBuilder()
                .setTitle("📋 Quality Control Report")
                .addFields(
                    {
                        name: "Title",
                        value: title
                    },
                    {
                        name: "Description",
                        value: description
                    },
                    {
                        name: "Submitted By",
                        value:
                            `${interaction.user.tag}\n\`${interaction.user.id}\``
                    }
                )
                .setTimestamp();

            await interaction.reply({
                content:
                    "✅ Report submitted successfully.",
                embeds: [embed]
            });

            // Send to log channel
            try {
                const logChannel =
                    await client.channels.fetch(
                        LOG_CHANNEL_ID
                    );

                if (logChannel) {
                    await logChannel.send({
                        embeds: [embed]
                    });
                }
            } catch (error) {
                console.error(
                    "❌ Could not send report log:"
                );

                console.error(error);
            }

            return;
        }

    } catch (error) {

        console.error(
            "❌ Interaction error:"
        );

        console.error(error);

        try {

            if (
                interaction.replied ||
                interaction.deferred
            ) {

                await interaction.followUp({
                    content:
                        "❌ Something went wrong while processing that command.",
                    ephemeral: true
                });

            } else {

                await interaction.reply({
                    content:
                        "❌ Something went wrong while processing that command.",
                    ephemeral: true
                });

            }

        } catch (replyError) {

            console.error(
                "❌ Could not send error response:"
            );

            console.error(replyError);
        }
    }
});

// ============================================================
// DIRECT DISCORD GATEWAY TEST
// ============================================================
//
// This does NOT use your bot token.
// It only checks whether Render can establish
// a WebSocket connection to Discord.
//
// If successful, it closes the test connection
// and then starts the actual Discord bot.
// ============================================================

function testDiscordGateway() {

    return new Promise((resolve, reject) => {

        console.log("");
        console.log("==========================================");
        console.log("🔌 TESTING DISCORD GATEWAY WEBSOCKET");
        console.log("==========================================");
        console.log("");

        const gatewayURL =
            "wss://gateway.discord.gg/?v=10&encoding=json";

        console.log(
            `🌐 Gateway: ${gatewayURL}`
        );

        console.log(
            "🔌 Opening WebSocket connection..."
        );

        console.log("");

        let finished = false;

        const ws = new WebSocket(
            gatewayURL,
            {
                handshakeTimeout: 10000
            }
        );

        const timeout = setTimeout(() => {

            if (finished) return;

            finished = true;

            console.error("");
            console.error(
                "=========================================="
            );
            console.error(
                "❌ GATEWAY WEBSOCKET TIMEOUT"
            );
            console.error(
                "=========================================="
            );
            console.error("");

            console.error(
                "Render could not complete a WebSocket connection"
            );

            console.error(
                "to Discord's Gateway within 15 seconds."
            );

            console.error("");

            try {
                ws.terminate();
            } catch (_) {}

            reject(
                new Error(
                    "Discord Gateway WebSocket timed out."
                )
            );

        }, 15000);

        // ----------------------------------------------------
        // OPEN
        // ----------------------------------------------------

        ws.on("open", () => {

            if (finished) return;

            console.log(
                "=========================================="
            );

            console.log(
                "✅ WEBSOCKET CONNECTION OPENED"
            );

            console.log(
                "=========================================="
            );

            console.log("");

            console.log(
                "Render successfully established a WebSocket connection to Discord."
            );

            console.log("");

            console.log(
                "⏳ Waiting for Discord Gateway response..."
            );

            console.log("");
        });

        // ----------------------------------------------------
        // MESSAGE
        // ----------------------------------------------------

        ws.on("message", data => {

            if (finished) return;

            finished = true;

            clearTimeout(timeout);

            const message =
                data.toString();

            console.log(
                "=========================================="
            );

            console.log(
                "📨 DISCORD GATEWAY RESPONDED"
            );

            console.log(
                "=========================================="
            );

            console.log("");

            console.log(
                "Raw Gateway response:"
            );

            console.log(
                message.substring(0, 2000)
            );

            console.log("");

            try {

                const packet =
                    JSON.parse(message);

                console.log(
                    "📦 Gateway opcode:",
                    packet.op
                );

                if (
                    packet.d &&
                    packet.d.heartbeat_interval
                ) {

                    console.log(
                        `💓 Heartbeat interval: ${packet.d.heartbeat_interval}ms`
                    );
                }

                console.log("");

                if (packet.op === 10) {

                    console.log(
                        "✅ Discord sent HELLO."
                    );

                    console.log("");

                    console.log(
                        "🎉 THE DISCORD GATEWAY IS REACHABLE FROM RENDER."
                    );

                } else {

                    console.log(
                        "⚠️ Discord responded, but the first packet was not HELLO."
                    );
                }

            } catch (error) {

                console.error(
                    "⚠️ Gateway response was not valid JSON:"
                );

                console.error(error);
            }

            console.log("");

            console.log(
                "=========================================="
            );

            console.log(
                "🧪 DIRECT GATEWAY TEST COMPLETE"
            );

            console.log(
                "=========================================="
            );

            console.log("");

            try {
                ws.close();
            } catch (_) {}

            resolve();

        });

        // ----------------------------------------------------
        // ERROR
        // ----------------------------------------------------

        ws.on("error", error => {

            if (finished) return;

            finished = true;

            clearTimeout(timeout);

            console.error("");

            console.error(
                "=========================================="
            );

            console.error(
                "❌ WEBSOCKET ERROR"
            );

            console.error(
                "=========================================="
            );

            console.error("");

            console.error(error);

            console.error("");

            reject(error);
        });

        // ----------------------------------------------------
        // CLOSE
        // ----------------------------------------------------

        ws.on("close", (code, reason) => {

            if (finished) return;

            console.log("");

            console.log(
                `🔴 WebSocket closed. Code: ${code}`
            );

            if (reason && reason.length > 0) {

                console.log(
                    `Reason: ${reason.toString()}`
                );
            }

            console.log("");
        });
    });
}

// ============================================================
// DISCORD LOGIN
// ============================================================

async function startBot() {

    try {

        // First test the raw Gateway connection.
        await testDiscordGateway();

        console.log("");
        console.log(
            "=========================================="
        );

        console.log(
            "🔑 NOW LOGGING INTO DISCORD.JS"
        );

        console.log(
            "=========================================="
        );

        console.log("");

        const loginTimeout =
            setTimeout(() => {

                console.error("");

                console.error(
                    "=========================================="
                );

                console.error(
                    "❌ DISCORD GATEWAY LOGIN TIMEOUT"
                );

                console.error(
                    "=========================================="
                );

                console.error("");

                console.error(
                    "The direct WebSocket test succeeded,"
                );

                console.error(
                    "but discord.js did not complete login."
                );

                console.error("");

                process.exit(1);

            }, 30000);

        await client.login(TOKEN);

        clearTimeout(loginTimeout);

        console.log("");

        console.log(
            "=========================================="
        );

        console.log(
            "✅ DISCORD LOGIN COMPLETED"
        );

        console.log(
            "=========================================="
        );

        console.log("");

    } catch (error) {

        console.error("");

        console.error(
            "=========================================="
        );

        console.error(
            "❌ DISCORD CONNECTION FAILED"
        );

        console.error(
            "=========================================="
        );

        console.error("");

        console.error(error);

        console.error("");

        process.exit(1);
    }
}

// ============================================================
// PROCESS ERROR HANDLERS
// ============================================================

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "❌ Unhandled promise rejection:"
        );

        console.error(error);
    }
);

process.on(
    "uncaughtException",
    error => {

        console.error(
            "❌ Uncaught exception:"
        );

        console.error(error);
    }
);

// ============================================================
// START EVERYTHING
// ============================================================

startBot();