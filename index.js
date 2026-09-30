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

const {
    WebSocketManager: DiscordWSManager
} = require("@discordjs/ws");

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
   DIRECT @discordjs/ws WORKAROUND
========================================================= */

/*
    IMPORTANT:

    discord.js 14.27.0 creates its own wrapper WebSocketManager.

    Internally, that wrapper creates an @discordjs/ws
    WebSocketManager and then calls:

        this._ws.fetchGatewayInformation()

    Render previously received a Cloudflare 429 response when
    discord.js tried to obtain /gateway/bot.

    We already confirmed that Render CAN connect directly to:

        wss://gateway.discord.gg/?v=10&encoding=json

    Therefore we patch the actual @discordjs/ws manager
    BEFORE discord.js creates it.

    This means:

        discord.js Client
              ↓
        discord.js WebSocketManager
              ↓
        @discordjs/ws WebSocketManager
              ↓
        OUR patched fetchGatewayInformation()
              ↓
        wss://gateway.discord.gg

    The normal discord.js Client remains intact.
*/

const originalFetchGatewayInformation =
    DiscordWSManager.prototype.fetchGatewayInformation;

if (
    typeof originalFetchGatewayInformation !== "function"
) {
    console.error(
        "❌ @discordjs/ws fetchGatewayInformation() was not found."
    );

    console.error(
        "Installed @discordjs/ws version may be incompatible."
    );

    process.exit(1);
}

DiscordWSManager.prototype.fetchGatewayInformation =
    async function patchedFetchGatewayInformation() {

        console.log("");
        console.log(
            "=========================================="
        );

        console.log(
            "🌐 @discordjs/ws DIRECT GATEWAY WORKAROUND"
        );

        console.log(
            "=========================================="
        );

        console.log("");

        console.log(
            "🚫 Skipping Discord /gateway/bot HTTP request."
        );

        console.log(
            `🔗 Gateway: ${DIRECT_GATEWAY_URL}`
        );

        console.log("");

        const gatewayInformation = {
            url: DIRECT_GATEWAY_URL,

            /*
                This bot is using one shard.
            */
            shards: 1,

            /*
                Values required by @discordjs/ws.

                Since we are bypassing the Gateway Bot HTTP
                endpoint, these are supplied locally.
            */
            session_start_limit: {
                total: 1000,
                remaining: 1000,
                reset_after: 0,
                max_concurrency: 1
            }
        };

        console.log(
            "✅ Direct Gateway information supplied."
        );

        console.log("");

        return gatewayInformation;
    };

console.log(
    "✅ @discordjs/ws Gateway workaround installed."
);

/* =========================================================
   EXPRESS WEB SERVER
========================================================= */

const app = express();

app.get("/", (req, res) => {
    res.status(200).send(
        "CL - Quality Control is running."
    );
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
    console.log(
        `🌐 Web server running on port ${PORT}`
    );
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

            const raw =
                fs.readFileSync(
                    DB_FILE,
                    "utf8"
                );

            if (raw.trim()) {

                const parsed =
                    JSON.parse(raw);

                db = {

                    strikes:
                        Array.isArray(parsed.strikes)
                            ? parsed.strikes
                            : [],

                    reports:
                        Array.isArray(parsed.reports)
                            ? parsed.reports
                            : []
                };
            }
        }

        console.log(
            `📁 Database loaded: ${db.strikes.length} strikes, ${db.reports.length} reports`
        );

    } catch (error) {

        console.error(
            "❌ Failed to load db.json:"
        );

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
            JSON.stringify(
                db,
                null,
                2
            ),
            "utf8"
        );

        console.log(
            "💾 Database saved."
        );

    } catch (error) {

        console.error(
            "❌ Failed to save db.json:"
        );

        console.error(error);
    }
}

function isDuplicateReport(title) {

    if (!title) {
        return false;
    }

    const normalizedTitle =
        title
            .trim()
            .toLowerCase();

    return db.reports.some(
        report =>
            typeof report.title === "string" &&
            report.title
                .trim()
                .toLowerCase() ===
                normalizedTitle
    );
}

loadDatabase();

/* =========================================================
   DISCORD CLIENT
========================================================= */

const client = new Client({

    intents: [
        GatewayIntentBits.Guilds
    ],

    /*
        One shard is enough for this bot.
    */

    ws: {
        version: "10"
    }
});

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

].map(
    command => command.toJSON()
);

/* =========================================================
   READY
========================================================= */

client.once(
    "ready",
    async () => {

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

            console.log(
                "🔄 Registering slash commands..."
            );

            const rest =
                new REST({
                    version: "10"
                })
                    .setToken(TOKEN);

            await rest.put(

                Routes.applicationCommands(
                    CLIENT_ID
                ),

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
    }
);

/* =========================================================
   DISCORD EVENTS
========================================================= */

client.on(
    "error",
    error => {

        console.error(
            "❌ Discord client error:"
        );

        console.error(error);
    }
);

client.on(
    "warn",
    warning => {

        console.warn(
            "⚠️ Discord warning:"
        );

        console.warn(warning);
    }
);

client.on(
    "debug",
    message => {

        console.log(
            `🔍 Discord debug: ${message}`
        );
    }
);

client.on(
    "shardReady",
    shardId => {

        console.log(
            `🟢 Discord shard ${shardId} is ready.`
        );
    }
);

client.on(
    "shardError",
    (error, shardId) => {

        console.error(
            `❌ Discord shard ${shardId} error:`
        );

        console.error(error);
    }
);

client.on(
    "shardDisconnect",
    (event, shardId) => {

        console.warn(
            `🔴 Discord shard ${shardId} disconnected.`
        );

        console.warn(event);
    }
);

client.on(
    "shardReconnecting",
    shardId => {

        console.log(
            `🔄 Discord shard ${shardId} reconnecting...`
        );
    }
);

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

            /* =================================================
               /strike
            ================================================= */

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

                    id:
                        Date.now().toString(),

                    userId:
                        user.id,

                    username:
                        user.tag,

                    reason,

                    moderatorId:
                        interaction.user.id,

                    moderatorTag:
                        interaction.user.tag,

                    createdAt:
                        new Date().toISOString()
                };

                db.strikes.push(
                    strike
                );

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

                                value:
                                    reason
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

            /* =================================================
               /report
            ================================================= */

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

                if (
                    isDuplicateReport(
                        title
                    )
                ) {

                    await interaction.reply({

                        content:
                            "❌ A report with that title already exists.",

                        ephemeral: true
                    });

                    return;
                }

                const report = {

                    id:
                        Date.now().toString(),

                    title,

                    description,

                    reporterId:
                        interaction.user.id,

                    reporterTag:
                        interaction.user.tag,

                    createdAt:
                        new Date().toISOString()
                };

                db.reports.push(
                    report
                );

                saveDatabase();

                const embed =
                    new EmbedBuilder()

                        .setTitle(
                            "📋 Quality Control Report"
                        )

                        .addFields(

                            {
                                name: "Title",

                                value:
                                    title
                            },

                            {
                                name: "Description",

                                value:
                                    description
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

                console.error(
                    replyError
                );
            }
        }
    }
);

/* =========================================================
   DIRECT GATEWAY TEST
========================================================= */

async function testDirectGateway() {

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
                "/?v=10&encoding=json";

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
                setTimeout(
                    () => {

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

                    },
                    15000
                );

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

                    clearTimeout(
                        timeout
                    );

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
                                "⚠️ First Gateway packet was not HELLO."
                            );
                        }

                    } catch (error) {

                        console.error(
                            "⚠️ Gateway response was not valid JSON."
                        );

                        console.error(
                            error
                        );
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

                    clearTimeout(
                        timeout
                    );

                    reject(error);
                }
            );
        }
    );
}

/* =========================================================
   START BOT
========================================================= */

async function startBot() {

    try {

        /*
            First verify the raw WebSocket path.
        */

        await testDirectGateway();

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
            "discord.js version: 14.27.0"
        );

        console.log(
            "@discordjs/ws version: 1.2.3"
        );

        console.log(
            "Gateway workaround: ENABLED"
        );

        console.log(
            `Gateway: ${DIRECT_GATEWAY_URL}`
        );

        console.log("");

        /*
            Discord.js will now create its internal
            @discordjs/ws manager.

            Because we patched the prototype above,
            its fetchGatewayInformation() call will
            return our direct Gateway information instead
            of making the blocked /gateway/bot request.
        */

        let loginFinished = false;

        const loginTimeout =
            setTimeout(
                () => {

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
                        "The raw Gateway connection works,"
                    );

                    console.error(
                        "but the authenticated discord.js Gateway"
                    );

                    console.error(
                        "connection did not reach READY."
                    );

                    console.error("");

                },
                30000
            );

        await client.login(
            TOKEN
        );

        loginFinished = true;

        clearTimeout(
            loginTimeout
        );

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

        console.error(
            error
        );

        console.error("");
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

        console.error(
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {

        console.error(
            "❌ Uncaught exception:"
        );

        console.error(
            error
        );
    }
);

/* =========================================================
   START
========================================================= */

startBot();