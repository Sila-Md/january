const { makeid } = require('./gen-id');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const zlib = require('zlib');
const { sendButtons } = require('gifted-btns');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

// === CONFIGURATION ===
const SESSION_PREFIX = "SILA-MD~";
const BOT_REPO = "https://github.com/Sila-Md/SILA-MD";
const WA_CHANNEL = "https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02";
const THUMBNAIL_URL = "https://files.catbox.moe/98k75b.jpeg";
const MSG_FOOTER = "© Sila Tech";

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

// Generate long session string from creds.json
function generateLongSession(credsPath) {
    try {
        const credsData = fs.readFileSync(credsPath, 'utf8');
        const compressedData = zlib.gzipSync(credsData);
        const b64data = compressedData.toString('base64');
        return SESSION_PREFIX + b64data;
    } catch (error) {
        console.error("Error generating long session:", error);
        return null;
    }
}

// Generate creds.json session (raw JSON as string)
function generateCredsSession(credsPath) {
    try {
        const credsData = fs.readFileSync(credsPath, 'utf8');
        return credsData;
    } catch (error) {
        console.error("Error reading creds:", error);
        return null;
    }
}

router.get('/', async (req, res) => {
    const id = makeid();
    const startTime = Date.now();
    const sessionType = (req.query.session || 'long').toLowerCase();
    let responseSent = false;

    async function SILA_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

        try {
            const items = ["Safari", "Chrome", "Firefox"];
            const randomItem = items[Math.floor(Math.random() * items.length)];

            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS(randomItem),
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;
                const latency = Date.now() - startTime;
                const performanceLevel = latency < 200 ? "🟢 Excellent" : latency < 500 ? "🟡 Good" : "🔴 Slow";

                try {
                    // Send QR code if available
                    if (qr && !responseSent && !res.headersSent) {
                        responseSent = true;
                        return await res.end(await QRCode.toBuffer(qr));
                    }

                    if (connection == "open") {
                        await delay(3000);
                        let credsPath = path.join(__dirname, 'temp', id, 'creds.json');

                        // Wait for creds.json to be fully written
                        let sessionData = null;
                        let attempts = 0;
                        const maxAttempts = 15;

                        while (attempts < maxAttempts && !sessionData) {
                            try {
                                if (fs.existsSync(credsPath)) {
                                    const data = fs.readFileSync(credsPath);
                                    if (data && data.length > 100) {
                                        sessionData = data;
                                        break;
                                    }
                                }
                                await delay(8000);
                                attempts++;
                            } catch (readError) {
                                console.error("Read error:", readError);
                                await delay(2000);
                                attempts++;
                            }
                        }

                        if (!sessionData) {
                            if (!responseSent && !res.headersSent) {
                                res.status(500).json({ code: "Session data not found" });
                                responseSent = true;
                            }
                            await removeFile('./temp/' + id);
                            return;
                        }

                        try {
                            let sessionCode;
                            let sessionLabel;

                            if (sessionType === 'long') {
                                let compressedData = zlib.gzipSync(sessionData);
                                let b64data = compressedData.toString('base64');
                                sessionCode = SESSION_PREFIX + b64data;
                                sessionLabel = 'LONG SESSION';
                            } else {
                                sessionCode = sessionData.toString('utf8');
                                sessionLabel = 'CREDS.JSON SESSION';
                            }

                            // Send session code first
                            let codeMsg = await sock.sendMessage(sock.user.id, { 
                                text: `*✅ YOUR ${sessionLabel}*\n\n${sessionCode}`
                            });

                            // Prepare buttons
                            const msgButtons = [
                                { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Session', copy_code: sessionCode }) },
                                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📂 Bot Repository', url: BOT_REPO }) },
                                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📢 Join Channel', url: WA_CHANNEL }) }
                            ];

                            // Send buttons
                            await sendButtons(sock, sock.user.id, {
                                title: 'SILA MD',
                                text: `*${sessionLabel}*\n\nTap button below to copy your session.`,
                                footer: MSG_FOOTER,
                                buttons: msgButtons
                            });

                            // Send formatted message
                            let desc = `┏━❑ *SILA-MD ${sessionLabel}* ✅
┏━❑ *SAFETY RULES* ━━━━━━━━━
┃ 🔹 *Session ID:* Sent above.
┃ 🔹 *Warning:* Do not share this code!
┃ 🔹 Keep this code safe.
┃ 🔹 Valid for 24 hours only.
┗━━━━━━━━━━━━━━━
┏━❑ *CHANNEL* ━━━━━━━━━
┃ 📢 Follow our channel: ${WA_CHANNEL}
┗━━━━━━━━━━━━━━━
┏━❑ *REPOSITORY* ━━━━━━━━━
┃ 💻 Repository: ${BOT_REPO}
┃ 👉 Fork & contribute!
┗━━━━━━━━━━━━━━━

╔► 𝐏𝐞𝐫𝐟𝐨𝐫𝐦𝐚𝐧𝐜𝐞 𝐋𝐞𝐯𝐞𝐥:
╠► ${performanceLevel}
╚► → 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 𝐭𝐢𝐦𝐞: ${latency}ms

> © 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

                            await sock.sendMessage(sock.user.id, {
                                text: desc,
                                contextInfo: {
                                    externalAdReply: {
                                        title: 'SILA MD',
                                        body: '© Sila Tech',
                                        thumbnailUrl: THUMBNAIL_URL,
                                        thumbnailWidth: 64,
                                        thumbnailHeight: 64,
                                        sourceUrl: WA_CHANNEL,
                                        mediaUrl: THUMBNAIL_URL,
                                        showAdAttribution: true,
                                        renderLargerThumbnail: false,
                                        previewType: 'PHOTO',
                                        mediaType: 1
                                    },
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: '120363402325089913@newsletter',
                                        newsletterName: '© Sila Tech',
                                        serverMessageId: Math.floor(Math.random() * 1000000)
                                    },
                                    isForwarded: true,
                                    forwardingScore: 999
                                }
                            }, { quoted: codeMsg });

                        } catch (e) {
                            console.error("Session processing error:", e);
                            
                            let errorMsg = await sock.sendMessage(sock.user.id, { 
                                text: `*⚠️ Session Generation Error*\n\n${e.message || e.toString()}\n\nPlease try again.`
                            });

                            let desc = `┏━❑ *SILA-MD SESSION* ⚠️
┏━❑ *SAFETY RULES* ━━━━━━━━━
┃ 🔹 *Error:* Session creation failed.
┃ 🔹 Please try again later.
┃ 🔹 Contact support if issue persists.
┗━━━━━━━━━━━━━━━
┏━❑ *CHANNEL* ━━━━━━━━━
┃ 📢 Follow our channel: ${WA_CHANNEL}
┗━━━━━━━━━━━━━━━
┏━❑ *REPOSITORY* ━━━━━━━━━
┃ 💻 Repository: ${BOT_REPO}
┗━━━━━━━━━━━━━━━

╔► 𝐏𝐞𝐫𝐟𝐨𝐫𝐦𝐚𝐧𝐜𝐞 𝐋𝐞𝐯𝐞𝐥:
╠► ${performanceLevel}
╚► → 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 𝐭𝐢𝐦𝐞: ${latency}ms

> © 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

                            await sock.sendMessage(sock.user.id, {
                                text: desc,
                                contextInfo: {
                                    externalAdReply: {
                                        title: 'SILA MD',
                                        body: '© Sila Tech',
                                        thumbnailUrl: THUMBNAIL_URL,
                                        thumbnailWidth: 64,
                                        thumbnailHeight: 64,
                                        sourceUrl: WA_CHANNEL,
                                        mediaUrl: THUMBNAIL_URL,
                                        showAdAttribution: true,
                                        renderLargerThumbnail: false,
                                        previewType: 'PHOTO',
                                        mediaType: 1
                                    },
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: '120363402325089913@newsletter',
                                        newsletterName: '© Sila Tech',
                                        serverMessageId: Math.floor(Math.random() * 1000000)
                                    },
                                    isForwarded: true,
                                    forwardingScore: 999
                                }
                            }, { quoted: errorMsg });
                        }

                        await delay(10);
                        await sock.ws.close();
                        await removeFile('./temp/' + id);
                        console.log(`👤 ${sock.user.id} 🔥 SILA-MD Session Connected (${sessionType.toUpperCase()}) ✅`);
                        await delay(10);
                        process.exit();
                    }

                } catch (err) {
                    console.log("⚠️ Error in connection.update:", err);
                }

                if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10);
                    SILA_MD_PAIR_CODE();
                }
            });

        } catch (err) {
            console.log("⚠️ SILA-MD Connection failed — Restarting service...", err);
            await removeFile('./temp/' + id);
            if (!responseSent && !res.headersSent) {
                await res.send({ code: "❗ SILA-MD Service Unavailable" });
                responseSent = true;
            }
        }
    }

    await SILA_MD_PAIR_CODE();
});

setInterval(() => {
    console.log("🔄 SILA-MD Restarting process...");
    process.exit();
}, 1800000); // 30 minutes

module.exports = router;
