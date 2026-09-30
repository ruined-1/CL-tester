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

const {
    WebSocketManager: DiscordWSManager
} = require("@discordjs/ws");

/* =========================================================
   CONFIGURATION
========================================================= */

const TOKEN = process.env.TOKEN;

const CLIENT_ID = "1536042818664013916";
const LOG_CHANNEL_ID = "1536043209157779587";

const PORT = process.env.PORT || 10000;

const DIRECT_GATEWAY_URL =
    "wss://gateway.discord.gg";

const DISCORD_API_URL =
    "https://discord.com/api/v10";

/* =========================================================
   STARTUP CHECK
========================================================= */

if (!TOKEN) {

    console.error(
        "❌ TOKEN environment variable is missing."
    );

    process.exit(1);
}

/* =========================================================
   @discordjs/ws GATEWAY WORKAROUND
========================================================= */

const originalFetchGatewayInformation =
    DiscordWSManager.prototype.fetchGatewayInformation;

if (
    typeof originalFetchGatewayInformation !==
    "function"
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

            url:
                DIRECT_GATEWAY_URL,

            shards:
                1,

            session_start_limit: {

                total:
                    1000,

                remaining:
                    1000,

                reset_after:
                    0,

                max_concurrency:
                    1
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
   DATABASE
========================================================= */

const DB_FILE =
    "./db.json";

let db = {

    strikes:
        [],

    reports:
        []
};

function loadDatabase() {

    try {

        if (
            fs.existsSync(DB_FILE)
        ) {

            const raw =
                fs.readFileSync(
                    DB_FILE,
                    "utf8"
                );

            if (
                raw.trim()
            ) {

                const parsed =
                    JSON.parse(raw);

                db = {

                    strikes:
                        Array.isArray(
                            parsed.strikes
                        )
                            ? parsed.strikes
                            : [],

                    reports:
                        Array.isArray(
                            parsed.reports
                        )
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

            strikes:
                [],

            reports:
                []
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

function isDuplicateReport(
    title
) {

    if (!title) {
        return false;
    }

    const normalizedTitle =
        title
            .trim()
            .toLowerCase();

    return db.reports.some(
        report =>
            typeof report.title ===
                "string" &&
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

const client =
    new Client({

        intents: [
            GatewayIntentBits.Guilds
        ],

        ws: {
            version:
                "10"
        }
    });

/* =========================================================
   EXPRESS WEB SERVER
========================================================= */

const app =
    express();

const server =
    app.listen(

        PORT,

        "0.0.0.0",

        () => {

            console.log(
                `🌐 Web server running on port ${PORT}`
            );

        }
    );

app.get(
    "/",
    (req, res) => {

        res.status(200).send(
            "CL - Quality Control is running."
        );
    }
);

app.get(
    "/health",
    (req, res) => {

        res.status(200).json({

            status:
                "online",

            discord:
                client.isReady()
                    ? "connected"
                    : "connecting",

            uptime:
                process.uptime()
        });
    }
);

/* =========================================================
   SLASH COMMANDS
========================================================= */

const commands = [

    new SlashCommandBuilder()

        .setName(
            "strike"
        )

        .setDescription(
            "Give a user a quality-control strike."
        )

        .addUserOption(
            option =>
                option

                    .setName(
                        "user"
                    )

                    .setDescription(
                        "The user receiving the strike."
                    )

                    .setRequired(
                        true
                    )
        )

        .addStringOption(
            option =>
                option

                    .setName(
                        "reason"
                    )

                    .setDescription(
                        "Reason for the strike."
                    )

                    .setRequired(
                        true
                    )
        ),

    new SlashCommandBuilder()

        .setName(
            "report"
        )

        .setDescription(
            "Submit a quality-control report."
        )

        .addStringOption(
            option =>
                option

                    .setName(
                        "title"
                    )

                    .setDescription(
                        "Title of the report."
                    )

                    .setRequired(
                        true
                    )
        )

        .addStringOption(
            option =>
                option

                    .setName(
                        "description"
                    )

                    .setDescription(
                        "Description of the report."
                    )

                    .setRequired(
                        true
                    )
        )

].map(
    command =>
        command.toJSON()
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

                    version:
                        "10",

                    timeout:
                        10000,

                    retries:
                        1

                })
                    .setToken(
                        TOKEN
                    );

            await rest.put(

                Routes.applicationCommands(
                    CLIENT_ID
                ),

                {
                    body:
                        commands
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
   INTERACTION ACKNOWLEDGMENT
========================================================= */

async function acknowledgeInteraction(
    interaction
) {

    console.log(
        "📡 Attempting to acknowledge interaction..."
    );

    try {

        await interaction.deferReply();

        console.log(
            `✅ Interaction acknowledged: /${interaction.commandName}`
        );

        return true;

    } catch (error) {

        console.error(
            "❌ deferReply() FAILED:"
        );

        console.error(error);

        console.error("");

        console.error(
            "ℹ️ The interaction reached the bot,"
        );

        console.error(
            "but the Discord HTTP interaction request failed."
        );

        return false;
    }
}

/* =========================================================
   INTERACTION HANDLER
========================================================= */

client.on(
    "interactionCreate",
    async interaction => {

        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        console.log("");

        console.log(
            `📥 Interaction received: /${interaction.commandName} from ${interaction.user.tag}`
        );

        const acknowledged =
            await acknowledgeInteraction(
                interaction
            );

        if (!acknowledged) {
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

                if (
                    !user ||
                    !reason
                ) {

                    await interaction.editReply({

                        content:
                            "❌ Missing required strike information."
                    });

                    return;
                }

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

                const safeReason =
                    reason.length > 1024
                        ? reason.substring(
                            0,
                            1021
                        ) + "..."
                        : reason;

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
                                name:
                                    "User",

                                value:
                                    `${user.tag}\n` +
                                    `\`${user.id}\``,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "Moderator",

                                value:
                                    interaction.user.tag,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "Reason",

                                value:
                                    safeReason
                            }
                        )

                        .setTimestamp();

                await interaction.editReply({

                    embeds:
                        [embed]
                });

                console.log(
                    `✅ /strike completed for ${user.tag}`
                );

                try {

                    const logChannel =
                        await client.channels.fetch(
                            LOG_CHANNEL_ID
                        );

                    if (
                        logChannel &&
                        typeof logChannel.send ===
                            "function"
                    ) {

                        await logChannel.send({

                            embeds:
                                [embed]
                        });

                        console.log(
                            "📋 Strike log sent successfully."
                        );
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
                    !title ||
                    !description
                ) {

                    await interaction.editReply({

                        content:
                            "❌ Missing required report information."
                    });

                    return;
                }

                if (
                    isDuplicateReport(
                        title
                    )
                ) {

                    await interaction.editReply({

                        content:
                            "❌ A report with that title already exists."
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

                const safeTitle =
                    title.length > 256
                        ? title.substring(
                            0,
                            253
                        ) + "..."
                        : title;

                const safeDescription =
                    description.length > 1024
                        ? description.substring(
                            0,
                            1021
                        ) + "..."
                        : description;

                const embed =
                    new EmbedBuilder()

                        .setTitle(
                            "📋 Quality Control Report"
                        )

                        .addFields(

                            {
                                name:
                                    "Title",

                                value:
                                    safeTitle
                            },

                            {
                                name:
                                    "Description",

                                value:
                                    safeDescription
                            },

                            {
                                name:
                                    "Submitted By",

                                value:
                                    `${interaction.user.tag}\n` +
                                    `\`${interaction.user.id}\``
                            }
                        )

                        .setTimestamp();

                await interaction.editReply({

                    content:
                        "✅ Report submitted successfully.",

                    embeds:
                        [embed]
                });

                console.log(
                    `✅ /report completed: ${title}`
                );

                try {

                    const logChannel =
                        await client.channels.fetch(
                            LOG_CHANNEL_ID
                        );

                    if (
                        logChannel &&
                        typeof logChannel.send ===
                            "function"
                    ) {

                        await logChannel.send({

                            embeds:
                                [embed]
                        });

                        console.log(
                            "📋 Report log sent successfully."
                        );
                    }

                } catch (error) {

                    console.error(
                        "❌ Could not send report log:"
                    );

                    console.error(error);
                }

                return;
            }

            /* =================================================
               UNKNOWN COMMAND
            ================================================= */

            await interaction.editReply({

                content:
                    "❌ Unknown command."
            });

        } catch (error) {

            console.error("");

            console.error(
                "=========================================="
            );

            console.error(
                "❌ INTERACTION ERROR"
            );

            console.error(
                "=========================================="
            );

            console.error(
                `Command: /${interaction.commandName}`
            );

            console.error(
                `User: ${interaction.user.tag}`
            );

            console.error(error);

            console.error("");

            try {

                if (
                    interaction.deferred
                ) {

                    await interaction.editReply({

                        content:
                            "❌ Something went wrong while processing that command."
                    });

                } else if (
                    !interaction.replied
                ) {

                    await interaction.reply({

                        content:
                            "❌ Something went wrong while processing that command.",

                        ephemeral:
                            true
                    });
                }

            } catch (replyError) {

                console.error(
                    "❌ Could not send interaction error response:"
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

            let finished =
                false;

            const ws =
                new WebSocket(
                    url,
                    {
                        handshakeTimeout:
                            10000
                    }
                );

            const timeout =
                setTimeout(
                    () => {

                        if (
                            finished
                        ) {
                            return;
                        }

                        finished =
                            true;

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

                    if (
                        finished
                    ) {
                        return;
                    }

                    finished =
                        true;

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

                            if (
                                packet.d &&
                                packet.d.heartbeat_interval
                            ) {

                                console.log(
                                    `💓 Heartbeat interval: ${packet.d.heartbeat_interval}ms`
                                );
                            }

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

                    if (
                        finished
                    ) {
                        return;
                    }

                    finished =
                        true;

                    clearTimeout(
                        timeout
                    );

                    reject(
                        error
                    );
                }
            );
        }
    );
}

/* =========================================================
   DIRECT DISCORD HTTP API TEST
========================================================= */

async function testDiscordHTTP() {

    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        "🌐 TESTING DISCORD HTTP API"
    );

    console.log(
        "=========================================="
    );

    console.log("");

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => {

                controller.abort();

            },
            10000
        );

    try {

        console.log(
            "📡 Requesting Discord /users/@me..."
        );

        const response =
            await fetch(

                `${DISCORD_API_URL}/users/@me`,

                {

                    method:
                        "GET",

                    headers: {

                        Authorization:
                            `Bot ${TOKEN}`
                    },

                    signal:
                        controller.signal
                }
            );

        const responseText =
            await response.text();

        console.log(
            `📡 Discord HTTP status: ${response.status}`
        );

        console.log(
            `📄 Content-Type: ${response.headers.get("content-type")}`
        );

        console.log(
            `📄 Response: ${responseText.substring(0, 500)}`
        );

        console.log("");

        if (
            response.ok
        ) {

            console.log(
                "✅ DISCORD HTTP API IS REACHABLE."
            );

        } else {

            console.error(
                "❌ DISCORD HTTP API RETURNED AN ERROR."
            );

            if (
                response.status === 429
            ) {

                console.error(
                    "⚠️ Discord/Cloudflare returned HTTP 429."
                );
            }
        }

    } catch (error) {

        console.error(
            "❌ DISCORD HTTP REQUEST FAILED:"
        );

        console.error(
            error
        );

    } finally {

        clearTimeout(
            timeout
        );
    }

    console.log("");
}

/* =========================================================
   GRACEFUL RENDER INSTANCE SHUTDOWN
========================================================= */

let shuttingDown =
    false;

async function shutdown(
    signal
) {

    if (
        shuttingDown
    ) {
        return;
    }

    shuttingDown =
        true;

    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        `🛑 ${signal} RECEIVED`
    );

    console.log(
        "🧹 PREVIOUS INSTANCE SHUTDOWN STARTED"
    );

    console.log(
        "=========================================="
    );

    console.log("");

    /*
        Stop accepting new HTTP requests.
    */

    try {

        if (
            typeof server.closeIdleConnections ===
            "function"
        ) {

            server.closeIdleConnections();
        }

        await new Promise(
            resolve => {

                let resolved =
                    false;

                const finish =
                    () => {

                        if (
                            resolved
                        ) {
                            return;
                        }

                        resolved =
                            true;

                        resolve();
                    };

                server.close(
                    () => {

                        console.log(
                            "🌐 HTTP server closed."
                        );

                        finish();
                    }
                );

                setTimeout(
                    finish,
                    5000
                );
            }
        );

    } catch (error) {

        console.error(
            "⚠️ Error closing HTTP server:"
        );

        console.error(error);
    }

    /*
        Disconnect Discord cleanly.
    */

    try {

        if (
            client.isReady()
        ) {

            console.log(
                "🔌 Disconnecting Discord client..."
            );

            client.destroy();

            console.log(
                "✅ Discord client disconnected."
            );

        } else {

            console.log(
                "ℹ️ Discord client was not ready."
            );
        }

    } catch (error) {

        console.error(
            "⚠️ Error disconnecting Discord:"
        );

        console.error(error);
    }

    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        "✅ PREVIOUS INSTANCE DELETED / SHUTDOWN COMPLETE"
    );

    console.log(
        "✅ Old bot process is exiting."
    );

    console.log(
        "=========================================="
    );

    console.log("");

    process.exit(0);
}

/*
    Render sends SIGTERM when replacing an old instance.
*/

process.once(
    "SIGTERM",
    () => {

        shutdown(
            "SIGTERM"
        );
    }
);

/*
    Also handle local/manual shutdowns.
*/

process.once(
    "SIGINT",
    () => {

        shutdown(
            "SIGINT"
        );
    }
);

/*
    Safety fallback.

    Render normally gives the process time to exit
    after SIGTERM. This prevents the bot from hanging
    indefinitely during shutdown.
*/

const forcedShutdownTimer =
    setTimeout(
        () => {

            if (
                shuttingDown
            ) {

                console.error("");

                console.error(
                    "⚠️ FORCE SHUTDOWN"
                );

                console.error(
                    "Old instance did not finish shutting down in time."
                );

                process.exit(1);
            }

        },
        25000
    );

forcedShutdownTimer.unref();

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

console.log("");

console.log(
    "=========================================="
);

console.log(
    "🚀 CL - QUALITY CONTROL STARTING"
);

console.log(
    "🆕 NEW RENDER INSTANCE STARTING"
);

console.log(
    "=========================================="
);

console.log("");

startBot();