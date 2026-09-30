require("dotenv").config();

const express = require("express");
const fs = require("fs");
const WebSocketManager = require("@discordjs/ws").WebSocketManager;

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1536042818664013916";
const LOG_CHANNEL_ID = "1536043209157779587";
const PORT = process.env.PORT || 10000;
const GATEWAY = "wss://gateway.discord.gg";
const DB_FILE = "./db.json";

if (!TOKEN) {
    console.error("❌ TOKEN environment variable is missing.");
    process.exit(1);
}

/* =========================================================
   GATEWAY WORKAROUND
========================================================= */

if (
    typeof WebSocketManager.prototype.fetchGatewayInformation !==
    "function"
) {
    console.error("❌ @discordjs/ws is incompatible.");
    process.exit(1);
}

WebSocketManager.prototype.fetchGatewayInformation =
    async function () {
        console.log("🌐 Using direct Discord Gateway.");
        return {
            url: GATEWAY,
            shards: 1,
            session_start_limit: {
                total: 1000,
                remaining: 1000,
                reset_after: 0,
                max_concurrency: 1
            }
        };
    };

/* =========================================================
   DATABASE
========================================================= */

let db = {
    strikes: [],
    reports: []
};

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = JSON.parse(
                fs.readFileSync(DB_FILE, "utf8")
            );

            db = {
                strikes: Array.isArray(data.strikes)
                    ? data.strikes
                    : [],
                reports: Array.isArray(data.reports)
                    ? data.reports
                    : []
            };
        }

        console.log(
            `📁 Database loaded: ${db.strikes.length} strikes, ${db.reports.length} reports`
        );
    } catch (error) {
        console.error("❌ Failed to load database:", error);
    }
}

function saveDB() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2)
        );
    } catch (error) {
        console.error("❌ Failed to save database:", error);
    }
}

function duplicateReport(title) {
    const normalized = title.trim().toLowerCase();

    return db.reports.some(
        report =>
            typeof report.title === "string" &&
            report.title.trim().toLowerCase() === normalized
    );
}

loadDB();

/* =========================================================
   DISCORD CLIENT
========================================================= */

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    ws: { version: "10" }
});

/* =========================================================
   EXPRESS
========================================================= */

const app = express();

app.get("/", (req, res) => {
    res.status(200).send(
        "CL - Quality Control is running."
    );
});

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        discord: client.isReady()
            ? "connected"
            : "connecting"
    });
});

const server = app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `🌐 Web server running on port ${PORT}`
        );
    }
);

/* =========================================================
   COMMANDS
========================================================= */

const commands = [
    new SlashCommandBuilder()
        .setName("strike")
        .setDescription(
            "Give a user a quality-control strike."
        )
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription(
                    "The user receiving the strike."
                )
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription(
                    "Reason for the strike."
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("report")
        .setDescription(
            "Submit a quality-control report."
        )
        .addStringOption(option =>
            option
                .setName("title")
                .setDescription(
                    "Title of the report."
                )
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("description")
                .setDescription(
                    "Description of the report."
                )
                .setRequired(true)
        )
].map(command => command.toJSON());

/* =========================================================
   READY
========================================================= */

client.once("ready", async () => {
    console.log("");
    console.log("==========================================");
    console.log(`🤖 Discord READY: ${client.user.tag}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(
        `🏠 Servers: ${client.guilds.cache.size}`
    );
    console.log("==========================================");
    console.log("");

    try {
        const rest = new REST({
            version: "10",
            timeout: 10000,
            retries: 1
        }).setToken(TOKEN);

        console.log("🔄 Registering slash commands...");

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        console.log(
            "✅ Slash commands registered successfully."
        );
    } catch (error) {
        console.error(
            "❌ Failed to register slash commands:",
            error
        );
    }
});

/* =========================================================
   DISCORD EVENTS
========================================================= */

client.on("error", error =>
    console.error("❌ Discord error:", error)
);

client.on("warn", warning =>
    console.warn("⚠️ Discord warning:", warning)
);

client.on("debug", message =>
    console.log(`🔍 Discord debug: ${message}`)
);

client.on("shardReady", shardId =>
    console.log(`🟢 Shard ${shardId} ready.`)
);

client.on("shardError", (error, shardId) =>
    console.error(
        `❌ Shard ${shardId} error:`,
        error
    )
);

client.on("shardReconnecting", shardId =>
    console.log(
        `🔄 Shard ${shardId} reconnecting...`
    )
);

/* =========================================================
   INTERACTIONS
========================================================= */

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    console.log(
        `📥 /${interaction.commandName} from ${interaction.user.tag}`
    );

    /*
        Acknowledge immediately so Discord knows
        the bot received the command.
    */

    try {
        await interaction.deferReply();
    } catch (error) {
        console.error(
            "❌ Interaction acknowledgment failed:",
            error
        );
        return;
    }

    try {
        /* =========================
           /strike
        ========================= */

        if (interaction.commandName === "strike") {
            const user =
                interaction.options.getUser("user");

            const reason =
                interaction.options.getString("reason");

            if (!user || !reason) {
                await interaction.editReply({
                    content:
                        "❌ Missing required strike information."
                });
                return;
            }

            const strike = {
                id: Date.now().toString(),
                userId: user.id,
                username: user.tag,
                reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                createdAt: new Date().toISOString()
            };

            db.strikes.push(strike);
            saveDB();

            const safeReason =
                reason.length > 1024
                    ? reason.substring(0, 1021) + "..."
                    : reason;

            /* ORIGINAL STRIKE EMBED */

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "⚠️ Quality Control Strike"
                    )
                    .setDescription(
                        `A strike has been issued to ${user}.`
                    )
                    .addFields(
                        {
                            name: "User",
                            value:
                                `${user.tag}\n` +
                                `\`${user.id}\``,
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
                            value: safeReason
                        }
                    )
                    .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(
                `✅ /strike completed for ${user.tag}`
            );

            await sendLog(embed, "Strike");
            return;
        }

        /* =========================
           /report
        ========================= */

        if (interaction.commandName === "report") {
            const title =
                interaction.options.getString("title");

            const description =
                interaction.options.getString("description");

            if (!title || !description) {
                await interaction.editReply({
                    content:
                        "❌ Missing required report information."
                });
                return;
            }

            if (duplicateReport(title)) {
                await interaction.editReply({
                    content:
                        "❌ A report with that title already exists."
                });
                return;
            }

            const report = {
                id: Date.now().toString(),
                title,
                description,
                reporterId: interaction.user.id,
                reporterTag: interaction.user.tag,
                createdAt: new Date().toISOString()
            };

            db.reports.push(report);
            saveDB();

            const safeTitle =
                title.length > 256
                    ? title.substring(0, 253) + "..."
                    : title;

            const safeDescription =
                description.length > 1024
                    ? description.substring(0, 1021) + "..."
                    : description;

            /* ORIGINAL REPORT EMBED */

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "📋 Quality Control Report"
                    )
                    .addFields(
                        {
                            name: "Title",
                            value: safeTitle
                        },
                        {
                            name: "Description",
                            value: safeDescription
                        },
                        {
                            name: "Submitted By",
                            value:
                                `${interaction.user.tag}\n` +
                                `\`${interaction.user.id}\``
                        }
                    )
                    .setTimestamp();

            await interaction.editReply({
                content:
                    "✅ Report submitted successfully.",
                embeds: [embed]
            });

            console.log(
                `✅ /report completed: ${title}`
            );

            await sendLog(embed, "Report");
            return;
        }

        await interaction.editReply({
            content: "❌ Unknown command."
        });

    } catch (error) {
        console.error(
            `❌ Error handling /${interaction.commandName}:`,
            error
        );

        try {
            await interaction.editReply({
                content:
                    "❌ Something went wrong while processing that command."
            });
        } catch {}
    }
});

/* =========================================================
   LOG CHANNEL
========================================================= */

async function sendLog(embed, type) {
    try {
        const channel =
            await client.channels.fetch(
                LOG_CHANNEL_ID
            );

        if (
            channel &&
            typeof channel.send === "function"
        ) {
            await channel.send({
                embeds: [embed]
            });

            console.log(
                `📋 ${type} log sent successfully.`
            );
        }
    } catch (error) {
        console.error(
            `❌ Could not send ${type.toLowerCase()} log:`,
            error
        );
    }
}

/* =========================================================
   RENDER SHUTDOWN
========================================================= */

let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;

    shuttingDown = true;

    console.log("");
    console.log(
        `🛑 ${signal} received. Removing previous instance...`
    );

    try {
        await new Promise(resolve => {
            server.close(() => resolve());

            setTimeout(
                resolve,
                5000
            );
        });
    } catch {}

    try {
        client.destroy();
    } catch {}

    console.log(
        "✅ PREVIOUS INSTANCE DELETED / SHUTDOWN COMPLETE"
    );

    process.exit(0);
}

process.once(
    "SIGTERM",
    () => shutdown("SIGTERM")
);

process.once(
    "SIGINT",
    () => shutdown("SIGINT")
);

/* =========================================================
   START
========================================================= */

console.log("🚀 CL - Quality Control starting...");

client.login(TOKEN).catch(error => {
    console.error(
        "❌ Discord login failed:",
        error
    );
});