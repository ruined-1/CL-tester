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

const INFRACTION_COLOR = 0x9B1C31;

/* =========================================================
   STARTUP
========================================================= */

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
    strikes: []
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
                    : []
            };
        }

        console.log(
            `📁 Database loaded: ${db.strikes.length} infractions`
        );

    } catch (error) {
        console.error(
            "❌ Failed to load database:",
            error
        );
    }
}

function saveDB() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2)
        );
    } catch (error) {
        console.error(
            "❌ Failed to save database:",
            error
        );
    }
}

loadDB();

/* =========================================================
   DISCORD CLIENT
========================================================= */

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    ws: {
        version: "10"
    }
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
        )
].map(command => command.toJSON());

/* =========================================================
   READY
========================================================= */

client.once("ready", async () => {
    console.log("");
    console.log(
        "=========================================="
    );
    console.log(
        `🤖 Discord READY: ${client.user.tag}`
    );
    console.log(
        `🆔 Bot ID: ${client.user.id}`
    );
    console.log(
        `🏠 Servers: ${client.guilds.cache.size}`
    );
    console.log(
        "=========================================="
    );
    console.log("");

    try {
        const rest = new REST({
            version: "10",
            timeout: 10000,
            retries: 1
        }).setToken(TOKEN);

        console.log(
            "🔄 Registering slash commands..."
        );

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
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
   /STRIKE
========================================================= */

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        console.log(
            `📥 /${interaction.commandName} from ${interaction.user.tag}`
        );

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

            if (interaction.commandName !== "strike") {
                await interaction.editReply({
                    content: "❌ Unknown command."
                });
                return;
            }

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

            /* Save infraction */

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

            /* Count total infractions */

            const infractionCount =
                db.strikes.filter(
                    entry =>
                        entry.userId === user.id
                ).length;

            const safeReason =
                reason.length > 1024
                    ? reason.substring(0, 1021) + "..."
                    : reason;

            /* =================================================
               DM USER
            ================================================= */

            let dmStatus =
                "Details sent to user DMs.";

            try {

                const dmEmbed =
                    new EmbedBuilder()
                        .setTitle(
                            "You received an Infraction."
                        )
                        .setDescription(
                            `**Reason**: ${safeReason}\n` +
                            `**Infractions**: ${infractionCount}`
                        )
                        .setColor(
                            INFRACTION_COLOR
                        );

                await user.send({
                    embeds: [dmEmbed]
                });

                console.log(
                    `📨 Infraction DM sent to ${user.tag}`
                );

            } catch (dmError) {

                const dmReason =
                    dmError?.message ||
                    "User DMs are disabled.";

                dmStatus =
                    `Unable to DM user: ${dmReason}`;

                console.error(
                    `❌ Could not DM ${user.tag}:`,
                    dmError
                );
            }

            /* =================================================
               PUBLIC EMBED
            ================================================= */

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "Tester Infraction Issued."
                    )
                    .setDescription(
                        `**Infracted User**: ${user}\n` +
                        `**Reason**: ${safeReason}\n` +
                        `**Infraction Count**: ${infractionCount}\n` +
                        `-# ${dmStatus}`
                    )
                    .setColor(
                        INFRACTION_COLOR
                    )
                    .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(
                `✅ /strike completed for ${user.tag} (${infractionCount} total infractions)`
            );

            await sendLog(embed);

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
    }
);

/* =========================================================
   LOG CHANNEL
========================================================= */

async function sendLog(embed) {
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
                "📋 Infraction log sent successfully."
            );
        }

    } catch (error) {

        console.error(
            "❌ Could not send infraction log:",
            error
        );
    }
}

/* =========================================================
   RENDER SHUTDOWN
========================================================= */

let shuttingDown = false;

async function shutdown(signal) {

    if (shuttingDown) {
        return;
    }

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

console.log(
    "🚀 CL - Quality Control starting..."
);

client.login(TOKEN).catch(error => {
    console.error(
        "❌ Discord login failed:",
        error
    );
});