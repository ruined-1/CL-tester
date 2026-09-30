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

const TOKEN = process.env.TOKEN;

const CLIENT_ID = "1536042818664013916";
const LOG_CHANNEL_ID = "1536043209157779587";

const PORT = process.env.PORT || 10000;

const DIRECT_GATEWAY_URL = "wss://gateway.discord.gg";

/* =========================================================
   STARTUP CHECK
========================================================= */

if (!TOKEN) {
    console.error("❌ TOKEN environment variable is missing.");
    process.exit(1);
}

/* =========================================================
   EXPRESS WEB SERVER
========================================================= */

const app = express();

app.get("/", (req, res) => {
    res.status(200).send("CL - Quality Control is running.");
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "online",
        discord: client.isReady()
            ? "connected"
            : "connecting"
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

/* =========================================================
   DATABASE
========================================================= */

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

    const normalizedTitle =
        title.trim().toLowerCase();

    return db.reports.some(report =>
        typeof report.title === "string" &&
        report.title.trim().toLowerCase() === normalizedTitle
    );
}

loadDatabase();

/* =========================================================
   DISCORD CLIENT
========================================================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

/* =========================================================
   DIRECT @discordjs/ws GATEWAY WORKAROUND
========================================================= */

/*
    discord.js 14.27.0 uses @discordjs/ws internally.

    Normally, the WebSocket manager obtains Gateway information
    through Discord's /gateway/bot endpoint.

    In our Render environment, that HTTP endpoint previously
    returned a Cloudflare 429 HTML response.

    We already verified that this WebSocket works directly:

        wss://gateway.discord.gg/?v=10&encoding=json

    Therefore we replace the WebSocket manager's
    fetchGatewayInformation() method before login.

    This keeps the normal discord.js Client intact while
    changing only the Gateway-information lookup.
*/

function configureDirectGateway() {
    if (!client.ws) {
        throw new Error(
            "Discord.js WebSocket manager was not available."
        );
    }

    console.log("");
    console.log("==========================================");
    console.log("🔧 CONFIGURING @discordjs/ws");
    console.log("==========================================");
    console.log("");

    console.log(
        "discord.js version: 14.27.0"
    );

    console.log(
        "Direct Gateway:",
        DIRECT_GATEWAY_URL
    );

    console.log("");

    const originalFetchGatewayInformation =
        client.ws.fetchGatewayInformation;

    if (
        typeof originalFetchGatewayInformation !==
        "function"
    ) {
        throw new Error(
            "client.ws.fetchGatewayInformation() is not available."
        );
    }

    /*
        Replace the normal /gateway/bot lookup.
    */

    client.ws.fetchGatewayInformation =
        async function directGatewayInformation() {

            console.log("");
            console.log(
                "🌐 @discordjs/ws: using DIRECT Gateway information"
            );

            console.log(
                "🚫 Skipping Discord /gateway/bot HTTP request"
            );

            console.log(
                `🔗 Gateway: ${DIRECT_GATEWAY_URL}`
            );

            console.log("");

            const gatewayInformation = {
                url: DIRECT_GATEWAY_URL,
                shards: 1,

                session_start_limit: {
                    total: 1000,
                    remaining: 1000,
                    reset_after: 0,
                    max_concurrency: 1
                }
            };

            /*
                discord.js's WebSocket manager exposes its
                current Gateway URL as .gateway.

                Set it explicitly as an additional safeguard.
            */

            client.ws.gateway =
                DIRECT_GATEWAY_URL;

            console.log(
                "✅ Direct Gateway information supplied."
            );

            console.log("");

            return gatewayInformation;
        };

    /*
        Also set the manager's Gateway property immediately.
    */

    client.ws.gateway =
        DIRECT_GATEWAY_URL;

    console.log(
        "✅ @discordjs/ws workaround installed."
    );

    console.log(
        "✅ Discord.js will retain its normal Client functionality."
    );

    console.log("");
}

/* =========================================================
   SLASH COMMANDS
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
   READY EVENT
========================================================= */

client.once("ready", async () => {

    console.log("");
    console.log("==========================================");
    console.log(
        `🤖 Discord READY: ${client.user.tag}`
    );
    console.log(
        `🆔 Bot ID: ${client.user.id}`
    );
    console.log(
        `🏠 Servers: ${client.guilds.cache.size}`
    );
    console.log("==========================================");
    console.log("");

    try {

        console.log(
            "🔄 Registering slash commands..."
        );

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

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
            "❌ Failed to register slash commands:"
        );

        console.error(error);
    }
});

/* =========================================================
   DISCORD EVENTS
========================================================= */

client.on("error", error => {

    console.error(
        "❌ Discord client error:"
    );

    console.error(error);
});

client.on("warn", warning => {

    console.warn(
        "⚠️ Discord warning:"
    );

    console.warn(warning);
});

client.on("shardReady", shardId => {

    console.log(
        `🟢 Discord shard ${shardId} is ready.`
    );
});

client.on("shardError", (error, shardId) => {

    console.error(
        `❌ Discord shard ${shardId} error:`
    );

    console.error(error);
});

client.on("shardDisconnect", (event, shardId) => {

    console.warn(
        `🔴 Discord shard ${shardId} disconnected.`
    );

    console.warn(event);
});

client.on("shardReconnecting", shardId => {

    console.log(
        `🔄 Discord shard ${shardId} reconnecting...`
    );
});

/* =========================================================
   INTERACTION HANDLER
========================================================= */

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        try {

            /* =============================================
               /strike
            ============================================= */

            if (
                interaction.commandName ===
                "strike"
            ) {

                const user =
                    interaction.options.getUser(
                        "user"
                    );

                const reason =
                    interaction.options.getString(
                        "reason"
                    );

                const strike = {
                    id: Date.now().toString(),

                    userId: user.id,
                    username: user.tag,

                    reason,

                    moderatorId:
                        interaction.user.id,

                    moderatorTag:
                        interaction.user.tag,

                    createdAt:
                        new Date().toISOString()
                };

                db.strikes.push(strike);

                saveDatabase();

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
                                value: reason
                            }
                        )

                        .setTimestamp();

                await interaction.reply({
                    embeds: [embed]
                });

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

            /* =============================================
               /report
            ============================================= */

            if (
                interaction.commandName ===
                "report"
            ) {

                const title =
                    interaction.options.getString(
                        "title"
                    );

                const description =
                    interaction.options.getString(
                        "description"
                    );

                /*
                    Duplicate report protection.
                */

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

                    title,
                    description,

                    reporterId:
                        interaction.user.id,

                    reporterTag:
                        interaction.user.tag,

                    createdAt:
                        new Date().toISOString()
                };

                db.reports.push(report);

                saveDatabase();

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📋 Quality Control Report"
                        )

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
                                    `${interaction.user.tag}\n` +
                                    `\`${interaction.user.id}\``
                            }
                        )

                        .setTimestamp();

                await interaction.reply({

                    content:
                        "✅ Report submitted successfully.",

                    embeds: [embed]
                });

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
    }
);

/* =========================================================
   DIRECT GATEWAY NETWORK TEST
========================================================= */

async function testDirectGateway() {

    /*
        We don't need to authenticate here.

        This only verifies that Render can establish a
        WebSocket connection to Discord.
    */

    const WebSocket =
        require("ws");

    return new Promise(
        (resolve, reject) => {

            console.log("");
            console.log(
                "=========================================="
            );

            console.log(
                "🔌 TESTING DIRECT DISCORD GATEWAY"
            );

            console.log(
                "=========================================="
            );

            console.log("");

            const url =
                `${DIRECT_GATEWAY_URL}` +
                `/?v=10&encoding=json`;

            console.log(
                `🌐 ${url}`
            );

            console.log("");

            let finished = false;

            const ws =
                new WebSocket(
                    url,
                    {
                        handshakeTimeout: 10000
                    }
                );

            const timeout =
                setTimeout(() => {

                    if (finished) {
                        return;
                    }

                    finished = true;

                    try {
                        ws.terminate();
                    } catch (_) {}

                    reject(
                        new Error(
                            "Direct Discord Gateway WebSocket timed out."
                        )
                    );

                }, 15000);

            ws.on(
                "open",
                () => {

                    console.log(
                        "✅ Direct Gateway WebSocket opened."
                    );
                }
            );

            ws.on(
                "message",
                data => {

                    if (finished) {
                        return;
                    }

                    finished = true;

                    clearTimeout(timeout);

                    try {

                        const packet =
                            JSON.parse(
                                data.toString()
                            );

                        console.log(
                            `📨 Gateway opcode: ${packet.op}`
                        );

                        if (
                            packet.op === 10
                        ) {

                            console.log(
                                "✅ Discord Gateway HELLO received."
                            );

                        } else {

                            console.log(
                                "⚠️ Received a Gateway packet, but it was not HELLO."
                            );
                        }

                    } catch (error) {

                        console.error(
                            "⚠️ Gateway response was not valid JSON."
                        );

                        console.error(error);
                    }

                    try {
                        ws.close();
                    } catch (_) {}

                    console.log("");

                    console.log(
                        "✅ DIRECT GATEWAY TEST PASSED."
                    );

                    console.log("");

                    resolve();
                }
            );

            ws.on(
                "error",
                error => {

                    if (finished) {
                        return;
                    }

                    finished = true;

                    clearTimeout(timeout);

                    reject(error);
                }
            );
        }
    );
}

/* =========================================================
   LOGIN
========================================================= */

async function startBot() {

    try {

        /*
            First prove the Render -> Discord WebSocket path.
        */

        await testDirectGateway();

        /*
            Now patch the actual @discordjs/ws manager that
            discord.js 14.27.0 uses internally.
        */

        configureDirectGateway();

        console.log("");
        console.log(
            "=========================================="
        );

        console.log(
            "🔑 LOGGING INTO DISCORD"
        );

        console.log(
            "=========================================="
        );

        console.log("");

        console.log(
            "discord.js: 14.27.0"
        );

        console.log(
            "@discordjs/ws: bundled with discord.js"
        );

        console.log(
            "Gateway workaround: ENABLED"
        );

        console.log(
            `Gateway: ${DIRECT_GATEWAY_URL}`
        );

        console.log("");

        let loginFinished = false;

        const loginTimeout =
            setTimeout(() => {

                if (loginFinished) {
                    return;
                }

                console.error("");

                console.error(
                    "=========================================="
                );

                console.error(
                    "❌ DISCORD LOGIN TIMEOUT"
                );

                console.error(
                    "=========================================="
                );

                console.error("");

                console.error(
                    "The direct WebSocket test succeeded,"
                );

                console.error(
                    "but discord.js/@discordjs/ws did not"
                );

                console.error(
                    "complete the authenticated Gateway login."
                );

                console.error("");

            }, 30000);

        await client.login(TOKEN);

        loginFinished = true;

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

        /*
            Keep the Express server alive so Render still
            considers the Web Service healthy.
        */
    }
}

/* =========================================================
   PROCESS ERROR HANDLERS
========================================================= */

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

/* =========================================================
   START
========================================================= */

startBot();