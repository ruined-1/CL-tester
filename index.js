require("dotenv").config();

const express = require("express");
const fs = require("fs");
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

if (!TOKEN) {
    console.error("❌ TOKEN environment variable is missing.");
    process.exit(1);
}

// ============================================================
// EXPRESS / RENDER WEB SERVER
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

const PORT = process.env.PORT || 10000;

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
        console.error("❌ Failed to save database:");
        console.error(error);
    }
}

function isDuplicateReport(title) {
    if (!title) return false;

    const normalizedTitle = title.trim().toLowerCase();

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
// DISCORD COMMANDS
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
// DISCORD DEBUG / CONNECTION EVENTS
// ============================================================

client.once("ready", async () => {
    console.log("");
    console.log("==========================================");
    console.log(`🤖 Discord READY: ${client.user.tag}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(`🏠 Servers: ${client.guilds.cache.size}`);
    console.log("==========================================");
    console.log("");

    // --------------------------------------------------------
    // REGISTER SLASH COMMANDS AFTER GATEWAY LOGIN
    // --------------------------------------------------------

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
            const user = interaction.options.getUser("user");
            const reason = interaction.options.getString("reason");

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
                        value: `${user.tag}\n\`${user.id}\``,
                        inline: true
                    },
                    {
                        name: "Moderator",
                        value: `${interaction.user.tag}`,
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

            // -----------------------------------------------
            // LOG STRIKE
            // -----------------------------------------------

            try {
                const logChannel =
                    await client.channels.fetch(LOG_CHANNEL_ID);

                if (logChannel) {
                    await logChannel.send({
                        embeds: [embed]
                    });
                }
            } catch (error) {
                console.error("❌ Could not send strike log:");
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

            // -----------------------------------------------
            // DUPLICATE CHECK
            // -----------------------------------------------

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
                content: "✅ Report submitted successfully.",
                embeds: [embed]
            });

            // -----------------------------------------------
            // LOG REPORT
            // -----------------------------------------------

            try {
                const logChannel =
                    await client.channels.fetch(LOG_CHANNEL_ID);

                if (logChannel) {
                    await logChannel.send({
                        embeds: [embed]
                    });
                }
            } catch (error) {
                console.error("❌ Could not send report log:");
                console.error(error);
            }

            return;
        }
    } catch (error) {
        console.error("❌ Interaction error:");
        console.error(error);

        try {
            if (interaction.replied || interaction.deferred) {
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
            console.error("❌ Could not send error response:");
            console.error(replyError);
        }
    }
});

// ============================================================
// DISCORD LOGIN
// ============================================================

async function startBot() {
    try {
        console.log("");
        console.log("==========================================");
        console.log("🔑 Logging into Discord Gateway...");
        console.log("==========================================");
        console.log("");

        const loginTimeout = setTimeout(() => {
            console.error("");
            console.error("==========================================");
            console.error("❌ DISCORD GATEWAY TIMEOUT");
            console.error("==========================================");
            console.error(
                "Discord Gateway did not complete the connection within 30 seconds."
            );
            console.error("");
            console.error(
                "The Render web server itself is running correctly."
            );
            console.error("");

            process.exit(1);
        }, 30000);

        await client.login(TOKEN);

        clearTimeout(loginTimeout);

        console.log("");
        console.log("==========================================");
        console.log("✅ Discord login completed.");
        console.log("==========================================");
        console.log("");
    } catch (error) {
        console.error("");
        console.error("==========================================");
        console.error("❌ DISCORD LOGIN FAILED");
        console.error("==========================================");
        console.error(error);
        console.error("");

        process.exit(1);
    }
}

// ============================================================
// PROCESS ERROR HANDLERS
// ============================================================

process.on("unhandledRejection", error => {
    console.error("❌ Unhandled promise rejection:");
    console.error(error);
});

process.on("uncaughtException", error => {
    console.error("❌ Uncaught exception:");
    console.error(error);
});

// ============================================================
// START
// ============================================================

startBot();